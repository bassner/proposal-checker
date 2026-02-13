import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessageLike } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import type { CheckGroupId, LLMPhase } from "@/types/review";
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
  signal?: AbortSignal;
  onToken?: (count: number, phase: LLMPhase) => void;
  onThinking?: (text: string) => void;
}

/** Check groups that receive rendered page images for visual inspection. */
const IMAGE_CHECK_GROUPS = new Set<CheckGroupId>(["figures", "writing"]);

export async function runCheckGroup({
  groupId,
  model,
  proposalText,
  pageImages,
  signal,
  onToken,
  onThinking,
}: RunCheckGroupOptions): Promise<CheckGroupRunResult> {
  const systemPrompt = CHECK_GROUP_PROMPTS[groupId];
  const messages: BaseMessageLike[] = [["system", systemPrompt]];

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
        text: `Here is the proposal text:\n\n${proposalText}\n\nBelow are the rendered pages of the PDF for visual inspection:`,
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
      `Here is the proposal text to review:\n\n${proposalText}`,
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
      ["user", `Here is the proposal text to review:\n\n${proposalText}`],
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
