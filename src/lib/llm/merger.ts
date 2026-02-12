import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessageLike } from "@langchain/core/messages";
import type { CheckGroupResult, LLMPhase } from "@/types/review";
import type { MergedFeedbackOutput } from "./schemas";
import { mergedFeedbackSchema } from "./schemas";
import { safeStructuredInvoke } from "./structured-invoke";
import type { TokenUsage } from "./structured-invoke";

const MERGER_SYSTEM_PROMPT = `You are an expert thesis proposal reviewer performing a final consolidation step. You have received findings from 7 independent check groups that reviewed the same thesis proposal. Your job is to:

1. DEDUPLICATE: Remove findings that say the same thing in different words (keep the best-worded version)
2. CONSOLIDATE: Merge closely related findings into single, comprehensive feedback items
3. FILTER: Remove any findings that are not actionable or are actually positive observations (e.g. "The proposal clearly explains the research question" or "Bibliography meets requirements")
4. RANK: Sort by severity (critical → major → minor → suggestion)
5. ASSESS: Provide an overall assessment of the proposal quality
6. LIMIT: Produce 0-25 actionable feedback items total. If all check groups returned zero findings (or only positive observations), return an empty findings array. Do not invent issues to fill a quota.

Rules:
- Keep the severity levels as assigned by the check groups unless clearly wrong
- Preserve specific section references and actionable details
- If multiple groups flagged the same issue with different severities, use the HIGHER severity
- When deduplicating or consolidating findings, UNION all locations from the source findings. Preserve every page, section, and quote detail — do not discard locations during merging.
- The overall assessment should be:
  - "good" = proposal is ready to submit with only minor tweaks (mostly suggestions/minor issues, or no issues at all)
  - "acceptable" = proposal needs some work but is on the right track (mix of minor and major issues)
  - "needs-work" = significant issues that must be addressed before submission (critical/major issues)
- Write a 2-3 sentence summary capturing the key strengths and weaknesses`;

/**
 * The 8th (and final) LLM call in the pipeline. Takes raw findings from all 7
 * parallel check groups and produces a deduplicated, consolidated, and ranked
 * set of 0-25 actionable feedback items plus an overall quality assessment.
 *
 * Handles failed check groups by informing the LLM so it can adjust confidence
 * in its overall assessment accordingly.
 *
 * @param model   - The LangChain chat model instance (Azure or Ollama).
 * @param results - Output from all 7 check groups (including any that errored).
 * @param options - Optional abort signal and streaming callbacks.
 * @returns Merged feedback with structured findings and token usage stats.
 */
export async function mergeFindings(
  model: BaseChatModel,
  results: CheckGroupResult[],
  options?: {
    signal?: AbortSignal;
    onToken?: (count: number, phase: LLMPhase) => void;
    onThinking?: (text: string) => void;
  }
): Promise<{ data: MergedFeedbackOutput; usage: TokenUsage | null }> {
  const allFindings = results.flatMap((r) =>
    r.findings.map((f) => ({
      ...f,
      sourceGroup: r.groupId,
    }))
  );

  const failedGroups = results.filter((r) => r.error);
  const failedInfo =
    failedGroups.length > 0
      ? `\n\nNote: The following check groups failed and could not produce findings: ${failedGroups.map((g) => g.groupId).join(", ")}. Take this into account in your overall assessment.`
      : "";

  console.log(`[merger] Merging ${allFindings.length} total findings from ${results.length} groups (${failedGroups.length} failed)`);

  const messages: BaseMessageLike[] = [
    ["system", MERGER_SYSTEM_PROMPT],
    [
      "user",
      `Here are all the raw findings from 7 check groups (${allFindings.length} total findings):

${JSON.stringify(allFindings, null, 2)}
${failedInfo}

Now deduplicate, consolidate, rank, and produce the final 0-25 feedback items with an overall assessment.`,
    ],
  ];

  const startTime = Date.now();
  console.log("[merger] Starting LLM call for merge");

  const { data, usage } = await safeStructuredInvoke(model, messages, mergedFeedbackSchema, {
    signal: options?.signal,
    onToken: options?.onToken,
    onThinking: options?.onThinking,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const usageStr = usage ? ` (${usage.inputTokens} in / ${usage.outputTokens} out)` : "";
  console.log(`[merger] Completed in ${elapsed}s — ${data.findings.length} merged findings, assessment: ${data.overallAssessment}${usageStr}`);

  return { data, usage };
}
