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

  // For the figures check group, include page images if available
  if (groupId === "figures" && pageImages && pageImages.length > 0) {
    console.log(`[check:${groupId}] Sending ${pageImages.length} page images for visual inspection`);
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      {
        type: "text" as const,
        text: `Here is the proposal text:\n\n${proposalText}\n\nBelow are the rendered pages of the PDF for visual inspection:`,
      },
    ];

    for (const page of pageImages) {
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

  const { data, usage } = await safeStructuredInvoke(
    model,
    messages,
    checkGroupOutputSchema,
    { signal, onToken, onThinking }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const usageStr = usage ? ` (${usage.inputTokens} in / ${usage.outputTokens} out)` : "";
  console.log(`[check:${groupId}] Completed in ${elapsed}s — ${data.findings.length} findings${usageStr}`);

  return { ...data, usage };
}
