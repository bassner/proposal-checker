"use client";

import { useEffect, useState } from "react";
import type { ReviewState } from "@/types/review";

const MERGE_ESTIMATE_SECONDS = 30;

/**
 * Compute estimated seconds remaining for the review pipeline.
 * Returns null if we don't have enough data yet (no groups completed).
 */
function computeEstimate(state: ReviewState): number | null {
  const { checkGroups, steps } = state;

  // Only estimate during the check or merge phase
  if (steps.check !== "active" && steps.check !== "done" && steps.merge !== "active") {
    return null;
  }

  const completed = checkGroups.filter(
    (g) => g.status === "done" && g.startTime && g.endTime
  );

  // Need at least one completed group to estimate
  if (completed.length === 0) return null;

  const totalDuration = completed.reduce(
    (sum, g) => sum + (g.endTime! - g.startTime!),
    0
  );
  const avgMs = totalDuration / completed.length;

  const remaining = checkGroups.filter(
    (g) => g.status === "pending" || g.status === "active"
  ).length;

  let estimateMs = remaining * avgMs;

  // Add merge estimate if merge hasn't started yet
  if (steps.merge === "pending" || steps.merge === undefined) {
    estimateMs += MERGE_ESTIMATE_SECONDS * 1000;
  } else if (steps.merge === "active" && state.mergeStartTime) {
    // Merge is running — estimate remaining merge time as max(0, 30s - elapsed)
    const mergeElapsed = Date.now() - state.mergeStartTime;
    estimateMs += Math.max(0, MERGE_ESTIMATE_SECONDS * 1000 - mergeElapsed);
  }

  return Math.max(0, estimateMs / 1000);
}

function formatEstimate(seconds: number): string {
  if (seconds < 60) {
    return "<1 min remaining";
  }
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} min remaining`;
}

interface TimeEstimateProps {
  state: ReviewState;
}

/**
 * Displays a rough "~X min remaining" estimate during the review pipeline.
 * Updates every 5 seconds to keep the estimate fresh without excessive re-renders.
 */
export function TimeEstimate({ state }: TimeEstimateProps) {
  const [, setTick] = useState(0);

  // Re-compute every 5 seconds so the estimate stays current
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const estimate = computeEstimate(state);
  if (estimate === null) return null;

  return (
    <span className="text-xs text-white/30">
      {formatEstimate(estimate)}
    </span>
  );
}
