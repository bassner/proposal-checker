"use client";

import { useEffect, useState } from "react";
import type { DeadlineAnalytics } from "@/lib/db";
import {
  AlertCircle,
  AlertTriangle,
  Loader2,
  TrendingDown,
  TrendingUp,
  Clock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeadlineRiskSummary() {
  const [data, setData] = useState<DeadlineAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/deadlines");
        if (!res.ok) throw new Error("Failed to load deadline analytics");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error || "Deadline analytics unavailable"}
      </div>
    );
  }

  const {
    riskBreakdown,
    overallEarlyAvgFindings,
    overallLateAvgFindings,
    last48hWarningCount,
  } = data;

  if (!riskBreakdown || riskBreakdown.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-white/30">
        No deadlines configured yet. Add one above to see risk analysis.
      </p>
    );
  }

  const qualityDiff = overallLateAvgFindings - overallEarlyAvgFindings;

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      {last48hWarningCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>{last48hWarningCount}</strong> review
            {last48hWarningCount !== 1 ? "s" : ""} submitted within 48h of a
            deadline
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Early submissions avg */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-white/40">
            <TrendingUp className="h-3 w-3 text-emerald-400" />
            Early Submissions (&gt;48h)
          </div>
          <div className="text-lg font-semibold text-white">
            {overallEarlyAvgFindings}
          </div>
          <div className="text-[10px] text-white/30">avg findings</div>
        </div>

        {/* Late submissions avg */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-white/40">
            <Clock className="h-3 w-3 text-amber-400" />
            Last-Minute (&lt;48h)
          </div>
          <div className="text-lg font-semibold text-white">
            {overallLateAvgFindings}
          </div>
          <div className="text-[10px] text-white/30">avg findings</div>
        </div>

        {/* Quality impact */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] text-white/40">
            {qualityDiff > 0 ? (
              <TrendingDown className="h-3 w-3 text-red-400" />
            ) : (
              <TrendingUp className="h-3 w-3 text-emerald-400" />
            )}
            Quality Impact
          </div>
          <div
            className={`text-lg font-semibold ${
              qualityDiff > 0 ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {qualityDiff > 0 ? "+" : ""}
            {qualityDiff.toFixed(1)}
          </div>
          <div className="text-[10px] text-white/30">
            {qualityDiff > 0
              ? "more findings when late"
              : qualityDiff < 0
                ? "fewer findings when late"
                : "no difference"}
          </div>
        </div>
      </div>

      {/* Risk breakdown table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] font-medium text-white/40">
              <th className="px-2 py-2">Deadline</th>
              <th className="px-2 py-2 text-right">Date</th>
              <th className="px-2 py-2 text-right">Submissions</th>
              <th className="px-2 py-2 text-right">On-Time %</th>
              <th className="px-2 py-2 text-right">Last 48h</th>
              <th className="px-2 py-2 text-right">Avg Findings</th>
              <th className="px-2 py-2 text-right">Early Avg</th>
              <th className="px-2 py-2 text-right">Late Avg</th>
            </tr>
          </thead>
          <tbody>
            {riskBreakdown.map((r) => (
              <tr
                key={r.deadlineId}
                className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
              >
                <td className="px-2 py-2 font-medium text-white/70">
                  {r.title}
                </td>
                <td className="px-2 py-2 text-right text-white/40">
                  {new Date(r.deadline).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-2 py-2 text-right text-white/60">
                  {r.totalSubmissions}
                </td>
                <td className="px-2 py-2 text-right">
                  <span
                    className={
                      r.onTimePercent >= 80
                        ? "text-emerald-400"
                        : r.onTimePercent >= 50
                          ? "text-amber-400"
                          : "text-red-400"
                    }
                  >
                    {r.onTimePercent}%
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  {r.last48hCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {r.last48hCount}
                    </span>
                  ) : (
                    <span className="text-white/30">0</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right text-white/60">
                  {r.avgFindings}
                </td>
                <td className="px-2 py-2 text-right text-emerald-400/70">
                  {r.avgFindingsEarly}
                </td>
                <td className="px-2 py-2 text-right text-amber-400/70">
                  {r.avgFindingsLate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
