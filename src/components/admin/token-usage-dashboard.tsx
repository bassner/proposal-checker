"use client";

import { useEffect, useState, useCallback } from "react";
import type { TokenUsageSummary } from "@/lib/db";
import {
  AlertCircle,
  Loader2,
  DollarSign,
  Hash,
  Brain,
  TrendingUp,
} from "lucide-react";

interface Props {
  initialData: TokenUsageSummary | null;
}

export function TokenUsageDashboard({ initialData }: Props) {
  const [data, setData] = useState<TokenUsageSummary | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/token-usage?days=${d}`);
      if (!res.ok) throw new Error("Failed to load token usage");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) return;
    fetchData(days);
  }, [initialData, days, fetchData]);

  const handleDaysChange = (newDays: number) => {
    setDays(newDays);
    fetchData(newDays);
  };

  if (loading && !data) {
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
        {error || "Token usage data unavailable"}
      </div>
    );
  }

  const maxDailyCost = Math.max(...data.daily.map((d) => d.costUsd), 0.001);

  return (
    <div className="space-y-5">
      {/* Time range selector */}
      <div className="flex items-center gap-2">
        {[7, 14, 30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => handleDaysChange(d)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              days === d
                ? "bg-blue-500/20 text-blue-400"
                : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-green-400" />
            <span className="text-xs text-white/40">Total Cost</span>
          </div>
          <div className="text-xl font-semibold text-white">${data.totalCostUsd.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-white/40">Avg / Review</span>
          </div>
          <div className="text-xl font-semibold text-white">${data.avgCostPerReview.toFixed(3)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Hash className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-white/40">Total Tokens</span>
          </div>
          <div className="text-xl font-semibold text-white">
            {formatTokens(data.totalInputTokens + data.totalOutputTokens + data.totalReasoningTokens)}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Brain className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-white/40">Reviews</span>
          </div>
          <div className="text-xl font-semibold text-white">{data.reviewCount}</div>
        </div>
      </div>

      {/* Token breakdown */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <h4 className="mb-2 text-xs font-medium text-white/40">Token Breakdown</h4>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-sm font-semibold text-white">{formatTokens(data.totalInputTokens)}</div>
            <div className="text-[10px] text-white/30">Input</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{formatTokens(data.totalOutputTokens)}</div>
            <div className="text-[10px] text-white/30">Output</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{formatTokens(data.totalReasoningTokens)}</div>
            <div className="text-[10px] text-white/30">Reasoning</div>
          </div>
        </div>
      </div>

      {/* Daily cost chart (CSS-only bar chart) */}
      {data.daily.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <h4 className="mb-3 text-xs font-medium text-white/40">
            Daily Cost (last {days} days)
          </h4>
          <div className="flex items-end gap-px" style={{ height: "120px" }}>
            {data.daily.map((d, i) => {
              const pct = (d.costUsd / maxDailyCost) * 100;
              const date = new Date(d.day);
              const label = `${date.getMonth() + 1}/${date.getDate()}`;
              return (
                <div
                  key={i}
                  className="group relative flex-1 min-w-0"
                  style={{ height: "100%" }}
                >
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                    <div
                      className="w-full rounded-t bg-green-500/60 transition-colors group-hover:bg-green-500/80"
                      style={{ height: `${Math.max(pct, 1)}%`, minHeight: d.costUsd > 0 ? "2px" : "0" }}
                    />
                  </div>
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-black/90 px-2 py-1 text-[10px] text-white/80 shadow-lg group-hover:block whitespace-nowrap">
                    <div>{label}</div>
                    <div>${d.costUsd.toFixed(3)} ({d.reviewCount} reviews)</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* X-axis labels (sparse) */}
          <div className="mt-1 flex text-[9px] text-white/20">
            <span className="flex-1 text-left">
              {data.daily.length > 0 && formatDayLabel(data.daily[0].day)}
            </span>
            <span className="flex-1 text-center">
              {data.daily.length > 1 && formatDayLabel(data.daily[Math.floor(data.daily.length / 2)].day)}
            </span>
            <span className="flex-1 text-right">
              {data.daily.length > 1 && formatDayLabel(data.daily[data.daily.length - 1].day)}
            </span>
          </div>
        </div>
      )}

      {/* Per-provider breakdown */}
      {data.byProvider.length > 0 && (
        <div className="overflow-x-auto">
          <h4 className="mb-2 text-xs font-medium text-white/40">By Provider</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/40">
                <th className="pb-2 pr-3 font-medium">Provider</th>
                <th className="pb-2 pr-3 font-medium text-right">Input</th>
                <th className="pb-2 pr-3 font-medium text-right">Output</th>
                <th className="pb-2 pr-3 font-medium text-right">Reasoning</th>
                <th className="pb-2 pr-3 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">Reviews</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.byProvider.map((row) => (
                <tr key={row.provider}>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                      {row.provider}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right text-white/50">{formatTokens(row.inputTokens)}</td>
                  <td className="py-2 pr-3 text-right text-white/50">{formatTokens(row.outputTokens)}</td>
                  <td className="py-2 pr-3 text-right text-white/50">{formatTokens(row.reasoningTokens)}</td>
                  <td className="py-2 pr-3 text-right font-medium text-white/70">${row.costUsd.toFixed(3)}</td>
                  <td className="py-2 text-right text-white/50">{row.reviewCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-user breakdown */}
      {data.byUser.length > 0 && (
        <div className="overflow-x-auto">
          <h4 className="mb-2 text-xs font-medium text-white/40">Top Users by Cost</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/40">
                <th className="pb-2 pr-3 font-medium">User</th>
                <th className="pb-2 pr-3 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">Reviews</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.byUser.map((row) => (
                <tr key={row.userId}>
                  <td className="py-2 pr-3">
                    <div className="text-white/70 font-medium">{row.userName}</div>
                    <div className="text-[10px] text-white/30">{row.userEmail}</div>
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-white/70">${row.totalCostUsd.toFixed(3)}</td>
                  <td className="py-2 text-right text-white/50">{row.reviewCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.reviewCount === 0 && (
        <p className="py-4 text-center text-xs text-white/30">
          No token usage data yet. Usage will appear after reviews are processed.
        </p>
      )}
    </div>
  );
}

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

function formatDayLabel(day: string): string {
  const d = new Date(day);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
