"use client";

import { useEffect, useState } from "react";
import type { AnalyticsData } from "@/lib/db";
import {
  BarChart3,
  AlertCircle,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface Props {
  initialData: AnalyticsData | null;
}

export function AnalyticsDashboard({ initialData }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/analytics");
        if (!res.ok) throw new Error("Failed to load analytics");
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
        {error || "Analytics unavailable"}
      </div>
    );
  }

  const statusCount = (s: string) => data.byStatus.find((r) => r.status === s)?.count ?? 0;
  const doneCount = statusCount("done");
  const errorCount = statusCount("error");
  const runningCount = statusCount("running");

  const maxDaily = Math.max(...data.daily.map((d) => d.count), 1);

  const severityOrder = ["critical", "major", "minor", "suggestion"];
  const severityColors: Record<string, string> = {
    critical: "bg-red-500",
    major: "bg-orange-500",
    minor: "bg-yellow-500",
    suggestion: "bg-blue-500",
  };
  const sortedSeverity = severityOrder
    .map((s) => data.severityAvg.find((r) => r.severity === s))
    .filter(Boolean) as { severity: string; avgCount: number }[];
  const maxSeverityAvg = Math.max(...sortedSeverity.map((s) => s.avgCount), 1);

  const maxCategoryCount = Math.max(...data.topCategories.map((c) => c.count), 1);

  return (
    <div className="space-y-5">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Total Reviews"
          value={data.totalReviews}
          icon={<BarChart3 className="h-4 w-4 text-blue-400" />}
        />
        <MetricCard
          label="Completed"
          value={doneCount}
          icon={<CheckCircle className="h-4 w-4 text-green-400" />}
        />
        <MetricCard
          label="Errors"
          value={errorCount}
          icon={<XCircle className="h-4 w-4 text-red-400" />}
        />
        <MetricCard
          label="Running"
          value={runningCount}
          icon={<Clock className="h-4 w-4 text-amber-400" />}
        />
      </div>

      {/* Provider breakdown */}
      {data.byProvider.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-white/40">By Provider</h3>
          <div className="flex gap-2">
            {data.byProvider.map((p) => {
              const pct = data.totalReviews > 0 ? Math.round((p.count / data.totalReviews) * 100) : 0;
              return (
                <div
                  key={p.provider}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="text-xs text-white/50">{p.provider}</div>
                  <div className="text-sm font-medium text-white">
                    {p.count} <span className="text-xs text-white/30">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily chart */}
      <div>
        <h3 className="mb-2 text-xs font-medium text-white/40">Reviews per Day (Last 30 Days)</h3>
        <div className="flex h-24 items-end gap-px rounded-lg border border-white/10 bg-white/5 p-2">
          {data.daily.map((d) => {
            const pct = (d.count / maxDaily) * 100;
            const dateStr = new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return (
              <div
                key={d.day}
                className="group relative flex-1"
                title={`${dateStr}: ${d.count}`}
              >
                <div
                  className="w-full rounded-t bg-blue-500/70 transition-colors group-hover:bg-blue-400"
                  style={{ height: `${Math.max(pct, d.count > 0 ? 4 : 0)}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-white/30">
          <span>
            {data.daily.length > 0
              ? new Date(data.daily[0].day).toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : ""}
          </span>
          <span>
            {data.daily.length > 0
              ? new Date(data.daily[data.daily.length - 1].day).toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : ""}
          </span>
        </div>
      </div>

      {/* Bottom row: severity + categories + top users */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Severity distribution */}
        <div>
          <h3 className="mb-2 text-xs font-medium text-white/40">Avg Findings per Review</h3>
          <div className="space-y-1.5">
            {sortedSeverity.map((s) => (
              <div key={s.severity} className="flex items-center gap-2">
                <span className="w-16 text-xs text-white/60 capitalize">{s.severity}</span>
                <div className="flex-1 overflow-hidden rounded-full bg-white/5 h-2">
                  <div
                    className={`h-full rounded-full ${severityColors[s.severity]}`}
                    style={{ width: `${(s.avgCount / maxSeverityAvg) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs text-white/50">{s.avgCount}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top categories */}
        <div>
          <h3 className="mb-2 text-xs font-medium text-white/40">Top Finding Categories</h3>
          {data.topCategories.length === 0 ? (
            <p className="text-xs text-white/30">No data yet</p>
          ) : (
            <div className="space-y-1.5">
              {data.topCategories.slice(0, 5).map((c) => (
                <div key={c.category} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-white/60">{c.category}</span>
                  <div className="w-16 overflow-hidden rounded-full bg-white/5 h-2">
                    <div
                      className="h-full rounded-full bg-purple-500/70"
                      style={{ width: `${(c.count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs text-white/50">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top users */}
        <div>
          <h3 className="mb-2 text-xs font-medium text-white/40">Top Users</h3>
          {data.topUsers.length === 0 ? (
            <p className="text-xs text-white/30">No data yet</p>
          ) : (
            <div className="space-y-1.5">
              {data.topUsers.map((u, i) => (
                <div key={u.userId} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] text-white/50">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-white/60">{u.userName || u.userEmail}</div>
                  </div>
                  <span className="text-xs text-white/50">{u.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-white/40">{label}</span>
      </div>
      <div className="text-xl font-semibold text-white">{value}</div>
    </div>
  );
}
