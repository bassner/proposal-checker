"use client";

import { useState } from "react";
import type { ReviewState, StepEvent } from "@/types/review";
import { StepItem } from "./step-item";
import { CheckGroupCard } from "./check-group-card";
import { LiveTimer } from "./live-timer";
import { Loader2 } from "lucide-react";
import { cn, formatTokensK, calcTokPerSec, estimateCost } from "@/lib/utils";

interface ReviewStepperProps {
  state: ReviewState;
}

const STEP_LABELS: Record<StepEvent["step"], string> = {
  upload: "Upload PDF",
  extract: "Extract Text & Render Pages",
  check: "Inspect Proposal",
  merge: "Merge & Deduplicate",
  results: "Done",
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

function totalReasoningTokens(state: ReviewState): number {
  const checkReasoning = state.checkGroups.reduce(
    (sum, g) => sum + (g.reasoningTokens ?? 0),
    0
  );
  return checkReasoning + state.mergeReasoningTokens;
}

export function ReviewStepper({ state }: ReviewStepperProps) {
  const [mergeThinkingExpanded, setMergeThinkingExpanded] = useState(false);
  const outputTokens = totalOutputTokens(state);
  const reasoningTokens = totalReasoningTokens(state);
  const inputTokens = state.totalInputTokens;

  // Parse merge thinking summary
  const showMergeThinking =
    state.steps.merge === "active" &&
    state.mergePhase !== "generating" &&
    state.mergeThinkingSummary;

  let mergeThinkingTitle = "";
  let mergeThinkingBody = "";
  if (showMergeThinking) {
    const match = state.mergeThinkingSummary!.match(/^\*\*(.+?)\*\*([\s\S]*)/);
    if (match) {
      mergeThinkingTitle = match[1].trim();
      mergeThinkingBody = match[2].replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    } else {
      mergeThinkingBody = state.mergeThinkingSummary!.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
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
                  <CheckGroupCard key={group.id} group={group} />
                ))}
              </div>
            )}

          {/* Merge token count + tok/s + timer while active or after finish */}
          {step === "merge" && state.mergeStartTime && (
            <div>
              <div className="flex items-center gap-2 text-xs">
                {state.steps.merge === "active" && (
                  <Loader2 className="h-3 w-3 animate-spin text-blue-400/60" />
                )}
                {state.steps.merge === "active" && (
                  <span className="w-[4.5rem] text-[10px] font-medium uppercase tracking-wider text-blue-400/50">
                    {state.mergePhase === "generating" ? "Generating" : "Thinking"}
                  </span>
                )}
                {state.mergeTokens > 0 && (
                  <span className={cn(
                    "w-[3.5rem] text-right tabular-nums",
                    state.steps.merge === "active" ? "text-blue-400/60" : "text-white/30"
                  )}>
                    {formatTokensK(state.mergeTokens)}
                    {state.mergeReasoningTokens > 0 ? ` (${formatTokensK(state.mergeReasoningTokens)} r)` : ""}
                  </span>
                )}
                {state.mergeTokens > 0 && (
                  <span className={cn(
                    "w-[3.5rem] text-right tabular-nums",
                    state.steps.merge === "active" ? "text-blue-400/60" : "text-white/30"
                  )}>
                    {state.steps.merge === "active"
                      ? calcTokPerSec(
                          state.mergeGeneratingStartTime ? state.mergeTokens - state.mergeGeneratingStartTokenCount : state.mergeTokens,
                          state.mergeGeneratingStartTime ?? state.mergeStartTime,
                          state.mergeEndTime ?? undefined
                        ) + " t/s"
                      : state.mergeGeneratingStartTime
                        ? calcTokPerSec(state.mergeTokens - state.mergeGeneratingStartTokenCount, state.mergeGeneratingStartTime, state.mergeEndTime ?? undefined) + " t/s"
                        : ""}
                  </span>
                )}
                {state.steps.merge === "active" && (
                  <LiveTimer startTime={state.mergeStartTime} className="w-[3rem] tabular-nums text-blue-400/60" />
                )}
                {state.steps.merge === "done" && state.mergeEndTime && (
                  <span className="w-[3rem] tabular-nums text-white/30">
                    {((state.mergeEndTime - state.mergeStartTime) / 1000).toFixed(1)}s
                  </span>
                )}
              </div>

              {/* Merge thinking summary — below counters, expandable */}
              {showMergeThinking && (
                <div
                  className="mt-1.5 cursor-pointer select-none"
                  onClick={() => setMergeThinkingExpanded((e) => !e)}
                >
                  {mergeThinkingTitle && (
                    <p className="break-words text-[11px] text-blue-400/60">
                      <span className="thinking-shimmer font-semibold">{mergeThinkingTitle}</span>
                      <span className="ml-1.5 font-normal text-blue-400/30">
                        ({mergeThinkingExpanded ? "click to collapse" : "click to expand"})
                      </span>
                    </p>
                  )}
                  {mergeThinkingBody && mergeThinkingExpanded && (
                    <p className="mt-0.5 break-words text-[11px] italic text-blue-400/40">
                      {mergeThinkingBody}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </StepItem>
      ))}

      {/* Overall timer + cost — centered at the bottom */}
      {state.startTime && (
        <div className="mt-4 flex items-center justify-center gap-3 border-t border-white/5 pt-4 text-sm font-medium">
          {state.status === "running" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <LiveTimer startTime={state.startTime} className="text-blue-300" />
              {state.provider === "azure" && (inputTokens > 0 || outputTokens > 0) && (
                <span className="tabular-nums text-blue-300/60">
                  {estimateCost(inputTokens, outputTokens)}
                </span>
              )}
            </>
          ) : (
            state.status === "done" && state.mergeEndTime && (
              <>
                <span className="tabular-nums text-white/50">
                  {((state.mergeEndTime - state.startTime) / 1000).toFixed(1)}s
                </span>
                {state.provider === "azure" && (inputTokens > 0 || outputTokens > 0) && (
                  <span className="tabular-nums text-white/30">
                    {estimateCost(inputTokens, outputTokens)}
                    {reasoningTokens > 0 && ` · ${formatTokensK(reasoningTokens)} reasoning`}
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
