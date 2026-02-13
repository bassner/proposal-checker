"use client";

import { useEffect, useState } from "react";
import type { ReviewerWorkloadStats } from "@/lib/db";
import {
  AlertCircle,
  Loader2,
  Users,
  Clock,
  ListChecks,
  PlayCircle,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

interface Props {
  initialData: ReviewerWorkloadStats | null;
}

export function WorkloadDashboard({ initialData }: Props) {
  const [data, setData] = useState<ReviewerWorkloadStats | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/workload");
        if (!res.ok) throw new Error("Failed to load workload stats");
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
        {error || "Workload data unavailable"}
      </div>
    );
  }

  const { reviewers, totals } = data;

  if (reviewers.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-white/30">
        No review assignments yet. Workload data will appear once reviews are assigned to team members.
      </p>
    );
  }

  const avgLoad = reviewers.length > 0
    ? Math.round((totals.totalPending + totals.totalInProgress) / reviewers.length * 10) / 10
    : 0;

  // Find the busiest reviewer (most pending + in-progress)
  const busiest = reviewers.reduce((max, r) =>
    (r.pending + r.inProgress) > (max.pending + max.inProgress) ? r : max
  , reviewers[0]);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Queue Depth"
          value={totals.totalPending}
          icon={<ListChecks className="h-4 w-4 text-amber-400" />}
        />
        <MetricCard
          label="In Progress"
          value={totals.totalInProgress}
          icon={<PlayCircle className="h-4 w-4 text-blue-400" />}
        />
        <MetricCard
          label="Completed"
          value={totals.totalCompleted}
          icon={<CheckCircle2 className="h-4 w-4 text-green-400" />}
        />
        <MetricCard
          label="Avg Load / Reviewer"
          value={avgLoad}
          icon={<TrendingUp className="h-4 w-4 text-purple-400" />}
        />
      </div>

      {/* Busiest reviewer highlight */}
      {busiest && (busiest.pending + busiest.inProgress) > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">{busiest.userName || busiest.userEmail}</span>
            {" "}has the highest load: {busiest.pending} pending + {busiest.inProgress} in progress
          </span>
        </div>
      )}

      {/* Reviewer table */}
      <div>
        <h3 className="mb-2 text-xs font-medium text-white/40">Per-Reviewer Breakdown</h3>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-3 py-2 text-left font-medium text-white/50">Reviewer</th>
                <th className="px-3 py-2 text-right font-medium text-white/50">Pending</th>
                <th className="px-3 py-2 text-right font-medium text-white/50">In Progress</th>
                <th className="px-3 py-2 text-right font-medium text-white/50">Completed</th>
                <th className="px-3 py-2 text-right font-medium text-white/50">Avg Turnaround</th>
                <th className="px-3 py-2 text-right font-medium text-white/50">Last 7d</th>
                <th className="px-3 py-2 text-right font-medium text-white/50">Last 30d</th>
                <th className="px-3 py-2 text-center font-medium text-white/50">Load</th>
              </tr>
            </thead>
            <tbody>
              {reviewers.map((r) => {
                const activeCount = r.pending + r.inProgress;
                const loadLevel = getLoadLevel(activeCount);
                return (
                  <tr key={r.userId} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <div className="font-medium text-white">{r.userName || "Unknown"}</div>
                      {r.userEmail && (
                        <div className="text-[10px] text-white/30">{r.userEmail}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">
                      {r.pending > 0 ? (
                        <span className="text-amber-400">{r.pending}</span>
                      ) : (
                        <span className="text-white/20">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">
                      {r.inProgress > 0 ? (
                        <span className="text-blue-400">{r.inProgress}</span>
                      ) : (
                        <span className="text-white/20">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">
                      {r.completed > 0 ? (
                        <span className="text-green-400">{r.completed}</span>
                      ) : (
                        <span className="text-white/20">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">
                      {r.avgTurnaroundMs != null ? (
                        <span className="flex items-center justify-end gap-1">
                          <Clock className="h-3 w-3 text-white/30" />
                          {formatDuration(r.avgTurnaroundMs)}
                        </span>
                      ) : (
                        <span className="text-white/20">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">
                      {r.last7Days || <span className="text-white/20">0</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">
                      {r.last30Days || <span className="text-white/20">0</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <LoadBadge level={loadLevel} count={activeCount} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load distribution bar */}
      <div>
        <h3 className="mb-2 text-xs font-medium text-white/40">Load Distribution</h3>
        <div className="space-y-1.5">
          {reviewers.map((r) => {
            const activeCount = r.pending + r.inProgress;
            const maxActive = Math.max(...reviewers.map((rv) => rv.pending + rv.inProgress), 1);
            const pct = (activeCount / maxActive) * 100;
            const loadLevel = getLoadLevel(activeCount);
            return (
              <div key={r.userId} className="flex items-center gap-2">
                <span className="w-28 truncate text-xs text-white/60" title={r.userName}>
                  {r.userName || r.userEmail || "Unknown"}
                </span>
                <div className="flex-1">
                  <div className="h-4 overflow-hidden rounded bg-white/5">
                    <div
                      className={`h-full rounded transition-all ${loadBarColor(loadLevel)}`}
                      style={{ width: `${Math.max(pct, activeCount > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                </div>
                <span className="w-8 text-right text-xs tabular-nums text-white/50">
                  {activeCount}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LoadLevel = "low" | "moderate" | "overloaded";

function getLoadLevel(activeCount: number): LoadLevel {
  if (activeCount >= 5) return "overloaded";
  if (activeCount >= 3) return "moderate";
  return "low";
}

function loadBarColor(level: LoadLevel): string {
  switch (level) {
    case "overloaded": return "bg-red-500/70";
    case "moderate": return "bg-amber-500/70";
    case "low": return "bg-green-500/70";
  }
}

function LoadBadge({ level, count }: { level: LoadLevel; count: number }) {
  const colors: Record<LoadLevel, string> = {
    low: "border-green-500/30 bg-green-500/10 text-green-400",
    moderate: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    overloaded: "border-red-500/30 bg-red-500/10 text-red-400",
  };
  const labels: Record<LoadLevel, string> = {
    low: "Low",
    moderate: "Med",
    overloaded: "High",
  };

  if (count === 0) {
    return (
      <span className="inline-block rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/30">
        Idle
      </span>
    );
  }

  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${colors[level]}`}>
      {labels[level]}
    </span>
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

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}
