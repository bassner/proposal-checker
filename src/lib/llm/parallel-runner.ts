import pLimit from "p-limit";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { CheckGroupId, CheckGroupMeta, Finding, FindingAdjudication, LLMPhase } from "@/types/review";
import type { CheckGroupResult } from "@/types/review";
import { normalizeFindingCategory } from "@/types/review";
import { runCheckGroup } from "./check-runner";
import type { TokenUsage } from "./structured-invoke";
import type { RenderedPage } from "@/lib/pdf/render";
import { insertCheckPerformance } from "@/lib/db";

const CHECK_TIMEOUT_MS = 600_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 2_000;
/** Max previous findings to pass to each check group. */
const MAX_PREV_FINDINGS_PER_GROUP = 20;

/** Map check group IDs to the finding categories they are responsible for. */
const CHECK_GROUP_CATEGORIES: Record<string, string[]> = {
  "structure": ["structure", "completeness"],
  "problem-motivation-objectives": ["logic", "completeness"],
  "bibliography": ["citation"],
  "figures": ["figures"],
  "writing-style": ["writing"],
  "writing-structure": ["writing", "structure"],
  "writing-formatting": ["formatting"],
  "ai-transparency": ["completeness", "other"],
  "schedule": ["completeness", "other"],
  "related-work": ["citation", "completeness"],
  "methodology": ["methodology"],
  "evaluation": ["methodology", "completeness"],
};

interface ParallelRunnerOptions {
  model: BaseChatModel;
  proposalText: string;
  pageImages?: RenderedPage[];
  /** Check groups to run. Determined by review mode (proposal vs thesis). */
  checkGroups: CheckGroupMeta[];
  /** Pre-built prompts with guidelines appended. If not provided, check-runner uses static prompts. */
  prompts?: Record<string, string>;
  /** Findings from the previous version of this document. Filtered by category per check group. */
  previousFindings?: Finding[];
  /** User adjudication decisions on previous findings. */
  previousAdjudications?: ReadonlyMap<number, FindingAdjudication>;
  maxConcurrency?: number;
  /** Review ID for persisting per-check performance metrics. */
  reviewId?: string;
  signal?: AbortSignal;
  onCheckStart?: (groupId: CheckGroupId) => void;
  onCheckComplete?: (groupId: CheckGroupId, findingCount: number, usage: TokenUsage | null) => void;
  onCheckFailed?: (groupId: CheckGroupId, error: string) => void;
  onCheckTokens?: (groupId: CheckGroupId, tokens: number, phase: LLMPhase) => void;
  onCheckThinking?: (groupId: CheckGroupId, text: string) => void;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("503") ||
      msg.includes("rate limit") ||
      msg.includes("too many requests") ||
      msg.includes("service unavailable")
    );
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AllChecksResult {
  results: CheckGroupResult[];
  /** Union of all previous finding indices that were sent to successful check groups. */
  sentPreviousFindingIndices: Set<number>;
}

export async function runAllChecks(
  options: ParallelRunnerOptions
): Promise<AllChecksResult> {
  const {
    model,
    proposalText,
    pageImages,
    checkGroups,
    prompts,
    previousFindings,
    previousAdjudications,
    maxConcurrency,
    reviewId,
    onCheckStart,
    onCheckComplete,
    onCheckFailed,
    onCheckTokens,
    onCheckThinking,
    signal: pipelineSignal,
  } = options;

  const concurrency = maxConcurrency ?? checkGroups.length;
  console.log(`[parallel] Starting ${checkGroups.length} checks (concurrency: ${concurrency})`);

  const limit = pLimit(concurrency);

  // Track which previous finding indices were sent to successful check groups
  const sentPreviousFindingIndices = new Set<number>();

  const tasks = checkGroups.map((group) =>
    limit(async (): Promise<CheckGroupResult> => {
      onCheckStart?.(group.id);

      let lastError: string = "Unknown error";
      const groupStartTime = Date.now();

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          console.log(`[parallel] Retrying ${group.id} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        }

        if (pipelineSignal?.aborted) {
          lastError = "Pipeline aborted";
          break;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
        const onPipelineAbort = () => controller.abort();
        pipelineSignal?.addEventListener("abort", onPipelineAbort, { once: true });

        try {
          // Filter previous findings by category for this check group
          let groupPrevFindings: Finding[] | undefined;
          let groupPrevFindingIndices: number[] | undefined;
          let groupPrevAdjudications: ReadonlyMap<number, FindingAdjudication> | undefined;
          if (previousFindings && previousFindings.length > 0) {
            const relevantCategories = new Set(CHECK_GROUP_CATEGORIES[group.id] ?? []);
            // Build [finding, originalIndex] pairs for tracking
            const indexedFiltered = previousFindings
              .map((f, i) => ({ finding: f, originalIndex: i }))
              .filter(({ finding }) =>
                relevantCategories.has(normalizeFindingCategory(finding.category))
              );
            // Truncate by effective severity (overridden if present): critical > major > minor > suggestion
            const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2, suggestion: 3 };
            const sorted = [...indexedFiltered].sort((a, b) => {
              const effSevA = previousAdjudications?.get(a.originalIndex)?.overriddenSeverity ?? a.finding.severity;
              const effSevB = previousAdjudications?.get(b.originalIndex)?.overriddenSeverity ?? b.finding.severity;
              return (severityOrder[effSevA] ?? 4) - (severityOrder[effSevB] ?? 4);
            });
            const truncated = sorted.slice(0, MAX_PREV_FINDINGS_PER_GROUP);
            groupPrevFindings = truncated.map(({ finding }) => finding);
            groupPrevFindingIndices = truncated.map(({ originalIndex }) => originalIndex);
            // Pass only adjudications relevant to this group's findings
            if (previousAdjudications && previousAdjudications.size > 0) {
              groupPrevAdjudications = previousAdjudications;
            }
          }

          const result = await runCheckGroup({
            groupId: group.id,
            model,
            proposalText,
            pageImages,
            systemPrompt: prompts?.[group.id],
            previousFindings: groupPrevFindings,
            previousFindingIndices: groupPrevFindingIndices,
            previousAdjudications: groupPrevAdjudications,
            signal: controller.signal,
            onToken: onCheckTokens
              ? (count, phase) => onCheckTokens(group.id, count, phase)
              : undefined,
            onThinking: onCheckThinking
              ? (text) => onCheckThinking(group.id, text)
              : undefined,
          });

          clearTimeout(timeout);
          pipelineSignal?.removeEventListener("abort", onPipelineAbort);
          onCheckComplete?.(group.id, result.findings.length, result.usage);

          // Track which previous finding indices were sent to this successful group
          if (groupPrevFindingIndices) {
            for (const idx of groupPrevFindingIndices) {
              sentPreviousFindingIndices.add(idx);
            }
          }

          // Record performance metrics (fire-and-forget)
          if (reviewId) {
            const durationMs = Date.now() - groupStartTime;
            insertCheckPerformance({
              reviewId,
              checkGroup: group.id,
              durationMs,
              promptTokens: result.usage?.inputTokens ?? 0,
              completionTokens: result.usage?.outputTokens ?? 0,
              reasoningTokens: result.usage?.reasoningTokens ?? 0,
              status: "done",
            }).catch((err) => console.error(`[parallel] Failed to record metrics for ${group.id}:`, err));
          }

          return {
            groupId: group.id,
            findings: result.findings,
            ...(result.resolvedPreviousFindings?.length ? { resolvedPreviousFindings: result.resolvedPreviousFindings } : {}),
          };
        } catch (error) {
          clearTimeout(timeout);
          pipelineSignal?.removeEventListener("abort", onPipelineAbort);
          lastError = error instanceof Error ? error.message : "Unknown error";
          console.error(`[parallel] Check ${group.id} failed (attempt ${attempt + 1}): ${lastError}`);

          if (attempt < MAX_RETRIES && isRetryableError(error)) {
            await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempt));
            continue;
          }

          break;
        }
      }

      onCheckFailed?.(group.id, lastError);

      // Record failed check performance metrics (fire-and-forget)
      if (reviewId) {
        const durationMs = Date.now() - groupStartTime;
        insertCheckPerformance({
          reviewId,
          checkGroup: group.id,
          durationMs,
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          status: "error",
        }).catch((err) => console.error(`[parallel] Failed to record error metrics for ${group.id}:`, err));
      }

      return {
        groupId: group.id,
        findings: [],
        error: lastError,
      };
    })
  );

  const results = await Promise.allSettled(tasks);

  const mapped = results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    const errMsg = r.reason instanceof Error ? r.reason.message : "Unknown error";
    console.error(`[parallel] Check ${checkGroups[i].id} rejected: ${errMsg}`);
    return {
      groupId: checkGroups[i].id,
      findings: [],
      error: errMsg,
    };
  });

  const successCount = mapped.filter((r) => !r.error).length;
  const totalFindings = mapped.reduce((sum, r) => sum + r.findings.length, 0);
  console.log(`[parallel] All checks done: ${successCount}/${checkGroups.length} succeeded, ${totalFindings} total findings, ${sentPreviousFindingIndices.size} prev finding indices sent`);

  return { results: mapped, sentPreviousFindingIndices };
}
