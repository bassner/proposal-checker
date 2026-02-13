"use client";

import { useEffect, useState } from "react";
import type { CheckGroupMetrics } from "@/lib/db";
import { ALL_CHECK_GROUP_META } from "@/types/review";
import type { CheckGroupId } from "@/types/review";
import {
  AlertCircle,
  Loader2,
  Clock,
  Zap,
  Hash,
} from "lucide-react";

interface Props {
  initialData: CheckGroupMetrics[] | null;
}

export function CheckMetricsDashboard({ initialData }: Props) {
  const [data, setData] = useState<CheckGroupMetrics[] | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/check-metrics");
        if (!res.ok) throw new Error("Failed to load check metrics");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialData]);

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
        {error || "Check metrics unavailable"}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-white/30">
        No check performance data yet. Metrics will appear after reviews are processed.
      </p>
    );
  }

  const maxDuration = Math.max(...data.map((d) => d.avgDurationMs), 1);
  const maxTokens = Math.max(...data.map((d) => d.avgPromptTokens + d.avgCompletionTokens + d.avgReasoningTokens), 1);

  // Summary stats
  const totalRuns = data.reduce((sum, d) => sum + d.totalRuns, 0);
  const totalErrors = data.reduce((sum, d) => sum + d.errorCount, 0);
  const overallFailureRate = totalRuns > 0 ? Math.round((totalErrors / totalRuns) * 1000) / 10 : 0;
  const avgDuration = totalRuns > 0
    ? Math.round(data.reduce((sum, d) => sum + d.avgDurationMs * d.totalRuns, 0) / totalRuns)
    : 0;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Hash className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-white/40">Total Runs</span>
          </div>
          <div className="text-xl font-semibold text-white">{totalRuns}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-white/40">Avg Duration</span>
          </div>
          <div className="text-xl font-semibold text-white">{formatDuration(avgDuration)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-xs text-white/40">Total Errors</span>
          </div>
          <div className="text-xl font-semibold text-white">{totalErrors}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-white/40">Failure Rate</span>
          </div>
          <div className="text-xl font-semibold text-white">{overallFailureRate}%</div>
        </div>
      </div>

      {/* Per-group table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-left text-white/40">
              <th className="pb-2 pr-3 font-medium">Check Group</th>
              <th className="pb-2 pr-3 font-medium">Avg Duration</th>
              <th className="pb-2 pr-3 font-medium">Avg Tokens</th>
              <th className="pb-2 pr-3 font-medium text-center">Runs</th>
              <th className="pb-2 pr-3 font-medium text-center">Errors</th>
              <th className="pb-2 font-medium text-right">Failure Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.map((row) => {
              const label = ALL_CHECK_GROUP_META[row.checkGroup as CheckGroupId]?.label ?? row.checkGroup;
              const totalTokens = row.avgPromptTokens + row.avgCompletionTokens + row.avgReasoningTokens;
              const failureColor = getFailureRateColor(row.failureRate);

              return (
                <tr key={row.checkGroup} className="group">
                  <td className="py-2.5 pr-3">
                    <div className="text-white/70 font-medium">{label}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 overflow-hidden rounded-full bg-white/5 h-1.5">
                        <div
                          className="h-full rounded-full bg-blue-500/70"
                          style={{ width: `${(row.avgDurationMs / maxDuration) * 100}%` }}
                        />
                      </div>
                      <span className="text-white/50 whitespace-nowrap">{formatDuration(row.avgDurationMs)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 overflow-hidden rounded-full bg-white/5 h-1.5">
                        <div
                          className="h-full rounded-full bg-purple-500/70"
                          style={{ width: `${(totalTokens / maxTokens) * 100}%` }}
                        />
                      </div>
                      <span className="text-white/50 whitespace-nowrap" title={`In: ${row.avgPromptTokens} | Out: ${row.avgCompletionTokens} | Reasoning: ${row.avgReasoningTokens}`}>
                        {formatTokens(totalTokens)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-center text-white/50">{row.totalRuns}</td>
                  <td className="py-2.5 pr-3 text-center text-white/50">
                    {row.errorCount > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/20 px-1.5 text-[10px] font-medium text-red-400">
                        {row.errorCount}
                      </span>
                    ) : (
                      <span className="text-white/20">0</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${failureColor}`}>
                      {row.failureRate}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1)}k`;
}

function getFailureRateColor(rate: number): string {
  if (rate <= 5) return "bg-green-500/20 text-green-400";
  if (rate <= 15) return "bg-yellow-500/20 text-yellow-400";
  return "bg-red-500/20 text-red-400";
}
