import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessageLike } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import type { CheckGroupId, Finding, FindingAdjudication, LLMPhase, ResolvedPreviousFinding } from "@/types/review";
import type { CheckGroupOutput } from "./schemas";
import { checkGroupOutputSchema } from "./schemas";
import { CHECK_GROUP_PROMPTS } from "./prompts";
import { safeStructuredInvoke } from "./structured-invoke";
import type { TokenUsage } from "./structured-invoke";
import type { RenderedPage } from "@/lib/pdf/render";

export interface CheckGroupRunResult extends CheckGroupOutput {
  usage: TokenUsage | null;
  resolvedPreviousFindings?: ResolvedPreviousFinding[];
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
  /** Original indices of previousFindings in the previous review's findings array. */
  previousFindingIndices?: number[];
  /** User adjudication decisions on previous findings. */
  previousAdjudications?: ReadonlyMap<number, FindingAdjudication>;
  signal?: AbortSignal;
  onToken?: (count: number, phase: LLMPhase) => void;
  onThinking?: (text: string) => void;
}

/** Check groups that receive rendered page images for visual inspection. */
const IMAGE_CHECK_GROUPS = new Set<CheckGroupId>(["figures", "writing-structure", "structure"]);

/**
 * Sanitize previous findings for injection into the user message.
 * Strips quote, location, details — only passes index, title, severity, category,
 * and any user adjudication data (dismissed/fixed status, overridden severity, comments).
 */
function sanitizePreviousFindings(
  findings: Finding[],
  startIndices?: number[],
  adjudications?: ReadonlyMap<number, FindingAdjudication>,
): string {
  const sanitized = findings.map((f, i) => {
    const idx = startIndices ? startIndices[i] : i;
    const adj = adjudications?.get(idx);
    return {
      index: idx,
      title: f.title,
      severity: f.severity,
      category: f.category,
      ...(adj?.annotationStatus ? { userStatus: adj.annotationStatus } : {}),
      ...(adj?.overriddenSeverity ? { overriddenSeverity: adj.overriddenSeverity } : {}),
      ...(adj?.hasComments ? { hasComments: true } : {}),
    };
  });
  return JSON.stringify(sanitized, null, 2);
}

export async function runCheckGroup({
  groupId,
  model,
  proposalText,
  pageImages,
  systemPrompt: systemPromptOverride,
  previousFindings,
  previousFindingIndices,
  previousAdjudications,
  signal,
  onToken,
  onThinking,
}: RunCheckGroupOptions): Promise<CheckGroupRunResult> {
  const systemPrompt = systemPromptOverride ?? CHECK_GROUP_PROMPTS[groupId];
  const messages: BaseMessageLike[] = [["system", systemPrompt]];

  // Build the previous findings context block (if any)
  const hasAdjudications = previousAdjudications && previousAdjudications.size > 0;
  const prevFindingsBlock = previousFindings && previousFindings.length > 0
    ? `\n\n=== PREVIOUS VERSION FINDINGS (DATA — DO NOT COPY VERBATIM) ===
The previous version of this document had these findings relevant to your check area.
Each finding includes an "index" for tracking:
${sanitizePreviousFindings(previousFindings, previousFindingIndices, previousAdjudications)}

Instructions:
- For each previous finding, determine if it has been RESOLVED or is STILL PRESENT in this version
- If RESOLVED in this version → add to resolvedPreviousFindings with the index + brief reasoning
- If STILL PRESENT → mark the corresponding new finding with previouslyFlagged: true AND include the index in matchedPreviousFindingIndices
- Identify NEW issues not present before (no previouslyFlagged, no matchedPreviousFindingIndices)${hasAdjudications ? `

Previous findings may include user adjudication data:
- userStatus "dismissed": The user/supervisor deemed this not applicable or irrelevant. Do NOT re-flag unless you have very strong evidence it remains a critical issue in the current version.
- userStatus "fixed": The user claims to have addressed this finding. Verify whether it was actually fixed in the current version.
- overriddenSeverity: A supervisor adjusted the severity level. Use the overridden severity for your assessment.
- hasComments: There is supervisor discussion on this finding — treat it as actively reviewed.
- No userStatus means the user has not acted on this finding.` : ""}
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
  const resolvedCount = data.resolvedPreviousFindings?.length ?? 0;
  const usageStr = usage ? ` (${usage.inputTokens} in / ${usage.outputTokens} out)` : "";
  console.log(`[check:${groupId}] Completed in ${elapsed}s — ${data.findings.length} findings, ${resolvedCount} resolved${usageStr}`);

  return { ...data, usage };
}
