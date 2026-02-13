import pLimit from "p-limit";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { CheckGroupId, LLMPhase } from "@/types/review";
import type { CheckGroupResult } from "@/types/review";
import { CHECK_GROUPS } from "@/types/review";
import { runCheckGroup } from "./check-runner";
import type { TokenUsage } from "./structured-invoke";
import type { RenderedPage } from "@/lib/pdf/render";

const CHECK_TIMEOUT_MS = 600_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 2_000;

interface ParallelRunnerOptions {
  model: BaseChatModel;
  proposalText: string;
  pageImages?: RenderedPage[];
  /** Pre-built prompts with guidelines appended. If not provided, check-runner uses static prompts. */
  prompts?: Record<CheckGroupId, string>;
  maxConcurrency?: number;
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

export async function runAllChecks(
  options: ParallelRunnerOptions
): Promise<CheckGroupResult[]> {
  const {
    model,
    proposalText,
    pageImages,
    prompts,
    maxConcurrency,
    onCheckStart,
    onCheckComplete,
    onCheckFailed,
    onCheckTokens,
    onCheckThinking,
    signal: pipelineSignal,
  } = options;

  const concurrency = maxConcurrency ?? CHECK_GROUPS.length;
  console.log(`[parallel] Starting ${CHECK_GROUPS.length} checks (concurrency: ${concurrency})`);

  const limit = pLimit(concurrency);

  const tasks = CHECK_GROUPS.map((group) =>
    limit(async (): Promise<CheckGroupResult> => {
      onCheckStart?.(group.id);

      let lastError: string = "Unknown error";

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
          const result = await runCheckGroup({
            groupId: group.id,
            model,
            proposalText,
            pageImages,
            systemPrompt: prompts?.[group.id],
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

          return {
            groupId: group.id,
            findings: result.findings,
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
    console.error(`[parallel] Check ${CHECK_GROUPS[i].id} rejected: ${errMsg}`);
    return {
      groupId: CHECK_GROUPS[i].id,
      findings: [],
      error: errMsg,
    };
  });

  const successCount = mapped.filter((r) => !r.error).length;
  const totalFindings = mapped.reduce((sum, r) => sum + r.findings.length, 0);
  console.log(`[parallel] All checks done: ${successCount}/${CHECK_GROUPS.length} succeeded, ${totalFindings} total findings`);

  return mapped;
}
