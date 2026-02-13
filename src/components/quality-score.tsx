"use client";

import { useMemo, useEffect, useState } from "react";
import type { Finding } from "@/types/review";
import { cn } from "@/lib/utils";
import { Gauge } from "lucide-react";

/** Default weights used when DB weights are unavailable. */
const DEFAULT_WEIGHTS: Record<string, number> = {
  critical: 10,
  major: 5,
  minor: 2,
  suggestion: 1,
};

interface SeverityWeight {
  severity: string;
  weight: number;
}

interface QualityScoreProps {
  findings: Finding[];
  className?: string;
}

/** SVG circular progress indicator. */
export function ScoreRing({
  score,
  maxScore,
  size = 56,
  strokeWidth = 5,
}: {
  score: number;
  maxScore: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = maxScore > 0 ? score / maxScore : 0;
  const offset = circumference * (1 - progress);

  // Color based on score percentage
  const pct = progress * 100;
  const ringColor =
    pct >= 80
      ? "text-emerald-400"
      : pct >= 60
        ? "text-yellow-400"
        : pct >= 40
          ? "text-orange-400"
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
        className="text-white/10 dark:text-white/10"
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

/** Hook to compute quality score from findings (fetches severity weights from API). */
export function useQualityScore(findings: Finding[]) {
  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/severity-weights")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.weights && Array.isArray(data.weights)) {
          const map: Record<string, number> = {};
          for (const w of data.weights as SeverityWeight[]) {
            map[w.severity] = w.weight;
          }
          setWeights(map);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const max = 100;
    let totalDeduction = 0;
    for (const finding of findings) {
      totalDeduction += weights[finding.severity] ?? 0;
    }
    const score = Math.max(0, max - totalDeduction);
    const pct = (score / max) * 100;
    const scoreColor =
      pct >= 80
        ? "text-emerald-400"
        : pct >= 60
          ? "text-yellow-400"
          : pct >= 40
            ? "text-orange-400"
            : "text-red-400";
    return { score, maxScore: max, scoreColor };
  }, [findings, weights]);
}

export function QualityScore({ findings, className }: QualityScoreProps) {
  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);

  // Fetch severity weights from the public authenticated endpoint
  useEffect(() => {
    let cancelled = false;
    fetch("/api/severity-weights")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.weights && Array.isArray(data.weights)) {
          const map: Record<string, number> = {};
          for (const w of data.weights as SeverityWeight[]) {
            map[w.severity] = w.weight;
          }
          setWeights(map);
        }
      })
      .catch(() => {
        // Use default weights silently
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { score, maxScore, deductions } = useMemo(() => {
    const max = 100;
    let totalDeduction = 0;
    const deductionMap: Record<string, { count: number; points: number }> = {};

    for (const finding of findings) {
      const w = weights[finding.severity] ?? 0;
      totalDeduction += w;
      if (!deductionMap[finding.severity]) {
        deductionMap[finding.severity] = { count: 0, points: 0 };
      }
      deductionMap[finding.severity].count++;
      deductionMap[finding.severity].points += w;
    }

    return {
      score: Math.max(0, max - totalDeduction),
      maxScore: max,
      deductions: deductionMap,
    };
  }, [findings, weights]);

  if (findings.length === 0) return null;

  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const scoreColor =
    pct >= 80
      ? "text-emerald-400"
      : pct >= 60
        ? "text-yellow-400"
        : pct >= 40
          ? "text-orange-400"
          : "text-red-400";

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="relative">
          <ScoreRing score={score} maxScore={maxScore} />
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums",
              scoreColor
            )}
          >
            {score}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-white/40" />
            <span className="text-xs font-medium text-white/60">Quality Score</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {Object.entries(deductions)
              .sort(([, a], [, b]) => b.points - a.points)
              .map(([sev, d]) => (
                <span key={sev} className="text-[10px] text-white/30">
                  {d.count} {sev} (-{d.points})
                </span>
              ))}
          </div>
        </div>
        <div className="text-right">
          <span className={cn("text-lg font-bold tabular-nums", scoreColor)}>
            {score}
          </span>
          <span className="text-xs text-white/30">/{maxScore}</span>
        </div>
      </div>
    </div>
  );
}
