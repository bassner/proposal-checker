"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { LLMPhase, ProviderType, StepStatus } from "@/types/review";

interface LiveTokenRateProps {
  /** Provider — Azure summarizes reasoning (chunks << real tokens), Local streams 1 chunk ≈ 1 token. */
  provider: ProviderType | null;
  status: StepStatus;
  phase?: LLMPhase | null;
  /** Wall-clock start of the whole call (used for thinking-rate on local + final average on done). */
  startTime?: number;
  endTime?: number;
  /** Live total tokens (chunk counter while streaming; API outputTokens after complete). */
  tokenCount: number;
  /** When the generating phase started — used to anchor an accurate content-rate, especially for Azure. */
  generatingStartTime?: number;
  /** Token counter value at the moment generating phase started. */
  generatingStartTokenCount?: number;
  className?: string;
}

/**
 * Live tokens-per-second display that adapts to what's actually measurable per
 * provider, so the number doesn't lie or jump:
 *
 *   - Local (gpt-oss): every streamed chunk is ~one token, so tokenCount/elapsed
 *     is honest throughout. The jump at completion (chunk count → API outputTokens)
 *     is at most a few %.
 *
 *   - Azure (Responses API): reasoning streams as polished summaries (~30 chunks
 *     for thousands of true reasoning tokens), so the chunk-rate is meaningless
 *     during thinking. We hide t/s in that phase and switch to a generating-anchor
 *     rate (delta tokens since generating started ÷ delta time) once content begins;
 *     then on done we show the full average using the API's outputTokens.
 *
 * Hidden when there's no honest number to show — better than reporting noise.
 */
export function LiveTokenRate({
  provider,
  status,
  phase,
  startTime,
  endTime,
  tokenCount,
  generatingStartTime,
  generatingStartTokenCount,
  className,
}: LiveTokenRateProps) {
  // Tick so elapsed stays fresh without waiting on chunk arrivals.
  // Date.now() must be read inside the effect (react-hooks/purity bans
  // impure calls during render).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (status === "done" || status === "error") return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [status]);

  // Pick the (numerator, denominator) pair that's honest in the current state.
  let numTokens = 0;
  let denomMs = 0;

  if (status === "done" && startTime != null && endTime != null) {
    // Final average using the API's true outputTokens (includes reasoning).
    numTokens = tokenCount;
    denomMs = endTime - startTime;
  } else if (status === "active") {
    if (provider === "local" && startTime != null) {
      // 1 chunk ≈ 1 token; full-call rate is accurate.
      numTokens = tokenCount;
      denomMs = now - startTime;
    } else if (phase === "generating" && generatingStartTime != null) {
      // Azure during generating — anchor on content phase for an honest rate.
      numTokens = tokenCount - (generatingStartTokenCount ?? 0);
      denomMs = now - generatingStartTime;
    }
    // Azure during thinking: no honest rate to show — bail out.
  }

  if (denomMs <= 100 || numTokens <= 0) return null;
  const tps = numTokens / (denomMs / 1000);
  const display = tps >= 100 ? Math.round(tps).toString() : tps.toFixed(1);
  return <span className={cn("tabular-nums", className)}>{display} t/s</span>;
}
