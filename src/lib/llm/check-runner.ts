import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessageLike } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import type { CheckGroupId, Finding, LLMPhase } from "@/types/review";
import type { CheckGroupOutput } from "./schemas";
import { checkGroupOutputSchema } from "./schemas";
import { CHECK_GROUP_PROMPTS } from "./prompts";
import { safeStructuredInvoke } from "./structured-invoke";
import type { TokenUsage } from "./structured-invoke";
import type { RenderedPage } from "@/lib/pdf/render";

export interface CheckGroupRunResult extends CheckGroupOutput {
  usage: TokenUsage | null;
}

interface RunCheckGroupOptions {
  groupId: CheckGroupId;
  model: BaseChatModel;
  proposalText: string;
  pageImages?: RenderedPage[];
  /** Pre-built system prompt (with guidelines). Falls back to static prompt if not provided. */
  systemPrompt?: string;
  /** Findings from the previous version of this document, relevant to this check group. */
  previousFindings?: Finding[];
  signal?: AbortSignal;
  onToken?: (count: number, phase: LLMPhase) => void;
  onThinking?: (text: string) => void;
}

/** Check groups that receive rendered page images for visual inspection. */
const IMAGE_CHECK_GROUPS = new Set<CheckGroupId>(["figures", "writing-structure"]);

/**
 * Sanitize previous findings for injection into the user message.
 * Strips quote, location, details — only passes title, severity, category.
 */
function sanitizePreviousFindings(findings: Finding[]): string {
  const sanitized = findings.map((f) => ({
    title: f.title,
    severity: f.severity,
    category: f.category,
  }));
  return JSON.stringify(sanitized, null, 2);
}

export async function runCheckGroup({
  groupId,
  model,
  proposalText,
  pageImages,
  systemPrompt: systemPromptOverride,
  previousFindings,
  signal,
  onToken,
  onThinking,
}: RunCheckGroupOptions): Promise<CheckGroupRunResult> {
  const systemPrompt = systemPromptOverride ?? CHECK_GROUP_PROMPTS[groupId];
  const messages: BaseMessageLike[] = [["system", systemPrompt]];

  // Build the previous findings context block (if any)
  const prevFindingsBlock = previousFindings && previousFindings.length > 0
    ? `\n\n=== PREVIOUS VERSION FINDINGS (DATA — DO NOT COPY VERBATIM) ===
The previous version of this document had these findings relevant to your check area:
${sanitizePreviousFindings(previousFindings)}

Instructions:
- Determine which previous findings have been addressed in this version
- Identify NEW issues not present before
- Mark persistent issues with previouslyFlagged: true
=== END PREVIOUS VERSION FINDINGS ===`
    : "";

  // For check groups that need visual inspection, include page images if available
  const useImages = IMAGE_CHECK_GROUPS.has(groupId) && (pageImages?.length ?? 0) > 0;

  if (useImages) {
    console.log(`[check:${groupId}] Sending ${pageImages!.length} page images for visual inspection`);
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      {
        type: "text" as const,
        text: `Here is the proposal text:\n\n${proposalText}${prevFindingsBlock}\n\nBelow are the rendered pages of the PDF for visual inspection:`,
      },
    ];

    for (const page of pageImages!) {
      content.push({
        type: "image_url" as const,
        image_url: {
          url: `data:image/png;base64,${page.imageBase64}`,
        },
      });
    }

    messages.push(new HumanMessage({ content }));
  } else {
    messages.push([
      "user",
      `Here is the proposal text to review:\n\n${proposalText}${prevFindingsBlock}`,
    ]);
  }

  const startTime = Date.now();
  console.log(`[check:${groupId}] Starting LLM call`);

  let result: { data: CheckGroupOutput; usage: TokenUsage | null };
  try {
    result = await safeStructuredInvoke(
      model,
      messages,
      checkGroupOutputSchema,
      { signal, onToken, onThinking }
    );
  } catch (error) {
    // If not using images or the request was aborted, no fallback — re-throw
    if (!useImages || signal?.aborted) throw error;

    // Multimodal call failed — fall back to text-only (model may not support vision)
    console.warn(`[check:${groupId}] Multimodal call failed, retrying text-only:`, error instanceof Error ? error.message : error);
    const textOnlyMessages: BaseMessageLike[] = [
      ["system", systemPrompt],
      ["user", `Here is the proposal text to review:\n\n${proposalText}${prevFindingsBlock}`],
    ];
    result = await safeStructuredInvoke(
      model,
      textOnlyMessages,
      checkGroupOutputSchema,
      { signal, onToken, onThinking }
    );
  }

  const { data, usage } = result;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const usageStr = usage ? ` (${usage.inputTokens} in / ${usage.outputTokens} out)` : "";
  console.log(`[check:${groupId}] Completed in ${elapsed}s — ${data.findings.length} findings${usageStr}`);

  return { ...data, usage };
}
