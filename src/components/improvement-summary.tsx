"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Severity } from "@/types/review";
import type { ImprovementSummary, SeverityCounts, IssueComparison } from "@/lib/review-improvement";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  AlertOctagon,
  AlertCircle,
  Lightbulb,
  History,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseImprovementResult {
  data: ImprovementSummary | null;
  available: boolean;
  loading: boolean;
}

export function useImprovement(reviewId: string): UseImprovementResult {
  const [data, setData] = useState<ImprovementSummary | null>(null);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchImprovement() {
      try {
        const res = await fetch(`/api/review/${reviewId}/improvement`);
        if (!res.ok) {
          setAvailable(false);
          return;
        }
        const json = await res.json();
        if (cancelled) return;

        if (json.available) {
          setAvailable(true);
          setData(json as ImprovementSummary);
        } else {
          setAvailable(false);
        }
      } catch {
        if (!cancelled) setAvailable(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchImprovement();
    return () => { cancelled = true; };
  }, [reviewId]);

  return { data, available, loading };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "suggestion"];

const severityMeta: Record<
  Severity,
  { label: string; color: string; barColor: string; icon: typeof AlertOctagon }
> = {
  critical: { label: "Critical", color: "text-red-400", barColor: "bg-red-500", icon: AlertOctagon },
  major: { label: "Major", color: "text-orange-400", barColor: "bg-orange-500", icon: AlertTriangle },
  minor: { label: "Minor", color: "text-yellow-400", barColor: "bg-yellow-400", icon: AlertCircle },
  suggestion: { label: "Suggestion", color: "text-blue-400", barColor: "bg-blue-500", icon: Lightbulb },
};

function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const meta = severityMeta[severity];
  const Icon = meta.icon;
  return <Icon className={cn("h-3 w-3", meta.color, className)} />;
}

/** SVG progress ring for the improvement score. */
function ScoreRing({
  score,
  size = 64,
  strokeWidth = 5,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const offset = circumference * (1 - progress);

  // Color based on score
  const ringColor =
    score >= 60
      ? "text-emerald-400"
      : score >= 30
        ? "text-amber-400"
        : "text-red-400";

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-white/10"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={cn(ringColor, "transition-all duration-700")}
      />
    </svg>
  );
}

/** Before/after severity comparison bars. */
function SeverityBars({
  previousCounts,
  currentCounts,
}: {
  previousCounts: SeverityCounts;
  currentCounts: SeverityCounts;
}) {
  const maxCount = useMemo(() => {
    let max = 1;
    for (const sev of SEVERITY_ORDER) {
      max = Math.max(max, previousCounts[sev], currentCounts[sev]);
    }
    return max;
  }, [previousCounts, currentCounts]);

  return (
    <div className="space-y-2">
      {SEVERITY_ORDER.map((sev) => {
        const prev = previousCounts[sev];
        const curr = currentCounts[sev];
        const meta = severityMeta[sev];
        const delta = curr - prev;

        return (
          <div key={sev} className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1.5">
                <SeverityIcon severity={sev} />
                <span className="text-white/50">{meta.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-white/30">{prev}</span>
                <ArrowRight className="h-2.5 w-2.5 text-white/20" />
                <span className={cn("font-bold tabular-nums", curr > 0 ? meta.color : "text-white/30")}>
                  {curr}
                </span>
                {delta !== 0 && (
                  <span
                    className={cn(
                      "text-[9px] font-medium",
                      delta < 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {delta > 0 ? "+" : ""}{delta}
                  </span>
                )}
              </div>
            </div>
            {/* Stacked bars: previous (faded) + current */}
            <div className="flex gap-0.5">
              <div className="h-1.5 flex-1 rounded-full bg-white/5">
                <div
                  className={cn("h-full rounded-full opacity-30", meta.barColor)}
                  style={{ width: prev > 0 ? `${Math.max((prev / maxCount) * 100, 4)}%` : "0%" }}
                />
              </div>
              <div className="h-1.5 flex-1 rounded-full bg-white/5">
                <div
                  className={cn("h-full rounded-full", meta.barColor)}
                  style={{ width: curr > 0 ? `${Math.max((curr / maxCount) * 100, 4)}%` : "0%" }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex justify-between text-[9px] text-white/20">
        <span>Previous</span>
        <span>Current</span>
      </div>
    </div>
  );
}

/** Compact list of issues (fixed or new). */
function IssueList({
  issues,
  variant,
  maxVisible = 5,
}: {
  issues: IssueComparison[];
  variant: "fixed" | "new";
  maxVisible?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? issues : issues.slice(0, maxVisible);
  const hasMore = issues.length > maxVisible;

  if (issues.length === 0) return null;

  return (
    <div className="space-y-1">
      {visible.map((issue, i) => (
        <div
          key={i}
          className="flex items-start gap-1.5 text-[11px]"
        >
          {variant === "fixed" ? (
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
          )}
          <div className="min-w-0 flex-1">
            <span className={cn("text-white/60", variant === "fixed" && "line-through decoration-white/20")}>
              {issue.title}
            </span>
            <SeverityIcon severity={issue.severity} className="ml-1 inline-block h-2.5 w-2.5" />
          </div>
        </div>
      ))}
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
        >
          + {issues.length - maxVisible} more
        </button>
      )}
    </div>
  );
}

export function ImprovementSummaryCard({ reviewId }: { reviewId: string }) {
  const { data, available, loading } = useImprovement(reviewId);
  const [expanded, setExpanded] = useState(true);

  if (loading || !available || !data) return null;

  const totalDelta = data.currentTotal - data.previousTotal;
  const isImproved = data.improvementScore >= 50;
  const isRegressed = data.improvementScore < 30 && data.currentTotal > data.previousTotal;

  const TrendIcon = isImproved
    ? TrendingUp
    : isRegressed
      ? TrendingDown
      : Minus;

  const trendColor = isImproved
    ? "text-emerald-400"
    : isRegressed
      ? "text-red-400"
      : "text-white/40";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={expanded}
        aria-controls="improvement-summary-content"
      >
        <History className="h-4 w-4 shrink-0 text-white/40" />
        <span className="flex-1 text-sm font-medium text-white/70">Improvement Tracking</span>
        <span className="flex items-center gap-1.5 text-xs text-white/30">
          <TrendIcon className={cn("h-3.5 w-3.5", trendColor)} />
          {totalDelta === 0
            ? "No change"
            : totalDelta < 0
              ? `${Math.abs(totalDelta)} fewer finding${Math.abs(totalDelta) !== 1 ? "s" : ""}`
              : `${totalDelta} more finding${totalDelta !== 1 ? "s" : ""}`}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-white/30 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Content */}
      {expanded && (
        <div id="improvement-summary-content" className="border-t border-white/5 px-4 pb-4 pt-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Improvement score */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Improvement Score
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <ScoreRing score={data.improvementScore} size={56} strokeWidth={4} />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-white/80">
                    {data.improvementScore}%
                  </span>
                </div>
                <div className="text-[10px] text-white/30">
                  <p>{data.previousTotal} → {data.currentTotal} findings</p>
                  <p className="mt-0.5">
                    vs{" "}
                    <Link
                      href={`/review/${data.previousReviewId}`}
                      className="text-blue-400/60 hover:text-blue-400 transition-colors"
                    >
                      {new Date(data.previousDate).toLocaleDateString()}
                    </Link>
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Severity comparison */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Severity Changes
              </h3>
              <SeverityBars
                previousCounts={data.previousCounts}
                currentCounts={data.currentCounts}
              />
            </div>

            {/* 3. Fixed issues */}
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                <CheckCircle2 className="h-3 w-3 text-emerald-400/60" />
                Fixed ({data.fixed.length})
              </h3>
              {data.fixed.length > 0 ? (
                <IssueList issues={data.fixed} variant="fixed" />
              ) : (
                <p className="text-[11px] text-white/20">No issues fixed</p>
              )}
            </div>

            {/* 4. New issues */}
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                <AlertTriangle className="h-3 w-3 text-amber-400/60" />
                New ({data.newIssues.length})
              </h3>
              {data.newIssues.length > 0 ? (
                <IssueList issues={data.newIssues} variant="new" />
              ) : (
                <p className="text-[11px] text-white/20">No new issues</p>
              )}
              {data.persistent.length > 0 && (
                <p className="text-[10px] text-white/20">
                  {data.persistent.length} persistent issue{data.persistent.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
