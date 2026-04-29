"use client";

import { useState } from "react";
import type { ReviewState, StepEvent } from "@/types/review";
import { StepItem } from "./step-item";
import { CheckGroupCard } from "./check-group-card";
import { LiveTimer } from "./live-timer";
import { LiveTokenRate } from "./live-token-rate";
import { Hourglass, Loader2 } from "lucide-react";
import { cn, formatTokensK, estimateCost } from "@/lib/utils";

interface ReviewStepperProps {
  state: ReviewState;
  /** Optional callback to cancel a running review. When provided, a Cancel button is shown next to the live timer. */
  onCancel?: () => void;
  /** True while the cancel request is in flight; the button is disabled. */
  cancelInFlight?: boolean;
}

const STEP_LABELS: Record<StepEvent["step"], string> = {
  upload: "Upload PDF",
  extract: "Extract Text & Render Pages",
  check: "Inspect Proposal",
  merge: "Merge & Deduplicate",
};

const STEP_ORDER: StepEvent["step"][] = [
  "upload",
  "extract",
  "check",
  "merge",
];

function totalOutputTokens(state: ReviewState): number {
  const checkTokens = state.checkGroups.reduce(
    (sum, g) => sum + (g.tokenCount ?? 0),
    0
  );
  return checkTokens + state.mergeTokens;
}

export function ReviewStepper({ state, onCancel, cancelInFlight }: ReviewStepperProps) {
  const [mergeThinkingExpanded, setMergeThinkingExpanded] = useState(false);
  const outputTokens = totalOutputTokens(state);
  const inputTokens = state.totalInputTokens;

  const isLocal = state.provider === "local";

  const mergeHasNoTokensYet =
    state.steps.merge === "active" &&
    (isLocal
      ? state.mergeTokens === 0
      : state.mergePhase !== "generating" && state.mergeTokens < 100);

  // Initializing = merge has started but no first token yet (queue/TTFT wait).
  const isMergeInitializing =
    state.steps.merge === "active" && !state.mergeFirstTokenTime;

  // Parse merge thinking summary
  const showMergeThinking =
    state.steps.merge === "active" &&
    state.mergePhase !== "generating" &&
    state.mergeThinkingSummary;

  let mergeThinkingTitle = "";
  let mergeThinkingBody = "";
  if (showMergeThinking) {
    if (isLocal) {
      // Raw chain-of-thought from gpt-oss has no headings — show body only.
      mergeThinkingBody = state.mergeThinkingSummary!.replace(/\s+/g, " ").trim();
    } else {
      const matches = [...state.mergeThinkingSummary!.matchAll(/\*\*(.+?)\*\*/g)];
      if (matches.length > 0) {
        const last = matches[matches.length - 1];
        mergeThinkingTitle = last[1].trim();
        mergeThinkingBody = state.mergeThinkingSummary!.slice(last.index! + last[0].length).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
      } else {
        mergeThinkingBody = state.mergeThinkingSummary!.replace(/\s+/g, " ").trim();
      }
    }
  }

  return (
    <div className="space-y-0">
      {STEP_ORDER.map((step, i) => (
        <StepItem
          key={step}
          label={STEP_LABELS[step]}
          status={state.steps[step]}
          isLast={i === STEP_ORDER.length - 1}
        >
          {/* Check sub-steps */}
          {step === "check" &&
            (state.steps.check === "active" ||
              state.steps.check === "done") && (
              <div className="w-full space-y-1.5">
                {state.checkGroups.map((group) => (
                  <CheckGroupCard key={group.id} group={group} provider={state.provider} />
                ))}
              </div>
            )}

          {/* Merge token count + timer while active or after finish */}
          {step === "merge" && state.mergeStartTime && (
            <div>
              <div className="flex items-center gap-2 text-xs">
                {state.steps.merge === "active" && isMergeInitializing && (
                  <Hourglass className="h-3 w-3 animate-pulse text-amber-400" />
                )}
                {state.steps.merge === "active" && !isMergeInitializing && (
                  <Loader2 className="h-3 w-3 animate-spin text-blue-400/60" />
                )}
                {state.steps.merge === "active" && (
                  <span className={cn(
                    "w-[4.5rem] text-[10px] font-medium uppercase tracking-wider",
                    isMergeInitializing ? "text-amber-400/70" : "text-blue-400/50"
                  )}>
                    {isMergeInitializing
                      ? "Initializing"
                      : state.mergePhase === "generating"
                        ? "Generating"
                        : "Thinking"}
                  </span>
                )}
                {(state.mergeTokens > 0 || state.steps.merge === "active") && (
                  <span className={cn(
                    "hidden w-[3.5rem] text-right tabular-nums sm:inline",
                    state.steps.merge === "active" ? "text-blue-400/60" : "text-slate-400 dark:text-white/30"
                  )}>
                    {mergeHasNoTokensYet ? "–" : formatTokensK(state.mergeTokens)}
                  </span>
                )}
                {!mergeHasNoTokensYet && (
                  <LiveTokenRate
                    provider={state.provider}
                    status={state.steps.merge}
                    phase={state.mergePhase}
                    firstTokenTime={state.mergeFirstTokenTime ?? undefined}
                    endTime={state.mergeEndTime ?? undefined}
                    tokenCount={state.mergeTokens}
                    generatingStartTime={state.mergeGeneratingStartTime ?? undefined}
                    generatingStartTokenCount={state.mergeGeneratingStartTokenCount}
                    className={cn(
                      "hidden w-[3.5rem] text-right text-xs sm:inline",
                      state.steps.merge === "active" ? "text-blue-400/60" : "text-slate-400 dark:text-white/30"
                    )}
                  />
                )}
                {state.steps.merge === "active" && (
                  isMergeInitializing ? (
                    <span className="w-[3rem] tabular-nums text-right text-xs text-amber-400/60">–</span>
                  ) : state.mergeFirstTokenTime ? (
                    <LiveTimer startTime={state.mergeFirstTokenTime} className="w-[3rem] tabular-nums text-blue-400/60" />
                  ) : null
                )}
                {state.steps.merge === "done" && state.mergeEndTime && (
                  <span className="w-[3rem] tabular-nums text-slate-400 dark:text-white/30">
                    {((state.mergeEndTime - (state.mergeFirstTokenTime ?? state.mergeStartTime)) / 1000).toFixed(1)}s
                  </span>
                )}
              </div>

              {/* Merge thinking summary. Azure: clickable title + expandable body.
                  Local (gpt-oss raw chain-of-thought): no title — body shown inline. */}
              {showMergeThinking && mergeThinkingTitle && (
                <div
                  className="mt-1.5 cursor-pointer select-none"
                  onClick={() => setMergeThinkingExpanded((e) => !e)}
                >
                  <p className="break-words text-[11px] text-blue-400/60">
                    <span className="thinking-shimmer font-semibold">{mergeThinkingTitle}</span>
                    <span className="ml-1.5 font-normal text-blue-400/30">
                      ({mergeThinkingExpanded ? "click to collapse" : "click to expand"})
                    </span>
                  </p>
                  {mergeThinkingBody && mergeThinkingExpanded && (
                    <p className="mt-0.5 max-h-80 overflow-y-auto break-words text-[11px] italic leading-relaxed text-blue-400/40 whitespace-pre-wrap">
                      {mergeThinkingBody}
                    </p>
                  )}
                </div>
              )}
              {showMergeThinking && !mergeThinkingTitle && mergeThinkingBody && (
                <div
                  className="mt-1.5 cursor-pointer select-none"
                  onClick={() => setMergeThinkingExpanded((e) => !e)}
                >
                  {mergeThinkingExpanded ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="max-h-48 overflow-y-auto break-words text-[11px] italic leading-relaxed text-blue-400/40 whitespace-pre-wrap"
                    >
                      {mergeThinkingBody}
                    </div>
                  ) : (
                    <div className="flex h-9 flex-col justify-end overflow-hidden">
                      <p className="break-words text-[11px] italic leading-relaxed text-blue-400/40">
                        {mergeThinkingBody}
                      </p>
                    </div>
                  )}
                  <p className="mt-0.5 text-[10px] font-normal text-blue-400/30">
                    ({mergeThinkingExpanded ? "click to collapse" : "click to expand"})
                  </p>
                </div>
              )}
            </div>
          )}
        </StepItem>
      ))}

      {/* Overall timer + cost — centered at the bottom */}
      {state.startTime && (
        <div className="mt-4 flex items-center justify-center gap-3 border-t border-slate-200 pt-4 text-sm font-medium dark:border-white/5">
          {state.status === "running" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <LiveTimer startTime={state.startTime} className="text-blue-300" />
              {outputTokens > 0 && (
                <span className="tabular-nums text-blue-300/60" title="Total output tokens streamed across all checks + merge">
                  {formatTokensK(outputTokens)} tokens
                </span>
              )}
              {state.provider === "azure" && (inputTokens > 0 || outputTokens > 0) && (
                <span className="tabular-nums text-blue-300/60">
                  {estimateCost(inputTokens, outputTokens)}
                </span>
              )}
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={cancelInFlight}
                  className={cn(
                    "ml-2 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    "border-red-400/30 text-red-300 hover:border-red-400/60 hover:bg-red-400/10",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {cancelInFlight ? "Cancelling…" : "Cancel"}
                </button>
              )}
            </>
          ) : (
            state.status === "done" && state.mergeEndTime && (
              <>
                <span className="tabular-nums text-slate-600 dark:text-white/50">
                  {((state.mergeEndTime - state.startTime) / 1000).toFixed(1)}s
                </span>
                {outputTokens > 0 && (
                  <span className="tabular-nums text-slate-400 dark:text-white/30" title="Total output tokens streamed across all checks + merge">
                    {formatTokensK(outputTokens)} tokens
                  </span>
                )}
                {state.provider === "azure" && (inputTokens > 0 || outputTokens > 0) && (
                  <span className="tabular-nums text-slate-400 dark:text-white/30">
                    {estimateCost(inputTokens, outputTokens)}
                  </span>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
