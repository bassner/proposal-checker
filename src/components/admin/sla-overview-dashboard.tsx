"use client";

import { useEffect, useState } from "react";
import type { SLAAnalytics, FindingSLARow } from "@/lib/db";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Target,
  TrendingUp,
  ExternalLink,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverdueSLAItem extends FindingSLARow {
  reviewFileName: string | null;
  reviewUserName: string;
  currentResolution: string;
}

interface SLAOverviewData {
  overdue: OverdueSLAItem[];
  analytics: SLAAnalytics | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SLAOverviewDashboard() {
  const [data, setData] = useState<SLAOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/sla-overview");
        if (!res.ok) throw new Error("Failed to load SLA overview");
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
        {error || "SLA data unavailable"}
      </div>
    );
  }

  const { overdue, analytics } = data;

  if (!analytics || analytics.totalSLAs === 0) {
    return (
      <p className="py-4 text-center text-xs text-white/30">
        No SLA deadlines have been set yet. SLA data will appear once
        supervisors set deadlines on findings.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Total SLAs"
          value={analytics.totalSLAs}
          icon={<Target className="h-4 w-4 text-blue-400" />}
        />
        <MetricCard
          label="Overdue"
          value={analytics.overdueCount}
          icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
          highlight={analytics.overdueCount > 0}
        />
        <MetricCard
          label="Compliance"
          value={`${analytics.complianceRate}%`}
          icon={<CheckCircle2 className="h-4 w-4 text-green-400" />}
        />
        <MetricCard
          label="Avg Resolution"
          value={
            analytics.avgResolutionMs != null
              ? formatDuration(analytics.avgResolutionMs)
              : "--"
          }
          icon={<TrendingUp className="h-4 w-4 text-purple-400" />}
        />
      </div>

      {/* Severity breakdown */}
      {analytics.bySeverity.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-white/40">
            By Severity
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {analytics.bySeverity.map((s) => (
              <div
                key={s.severity}
                className="rounded-lg border border-white/10 bg-white/5 p-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs capitalize text-white/60">
                    {s.severity}
                  </span>
                  <SeverityDot severity={s.severity} />
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-white">
                  {s.total}
                </div>
                {s.overdue > 0 && (
                  <div className="mt-0.5 text-[10px] text-red-400">
                    {s.overdue} overdue
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue table */}
      {overdue.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-medium text-white/40">
            Overdue Findings ({overdue.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-3 py-2 text-left font-medium text-white/50">
                    Review
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-white/50">
                    Author
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-white/50">
                    Finding #
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-white/50">
                    Severity
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-white/50">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-white/50">
                    Deadline
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-white/50">
                    Overdue By
                  </th>
                  <th className="px-3 py-2 text-center font-medium text-white/50">
                    Link
                  </th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((item) => {
                  const daysOverdue = Math.floor(
                    (Date.now() - new Date(item.deadline).getTime()) /
                      (1000 * 60 * 60 * 24)
                  );
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-white/5 hover:bg-white/5"
                    >
                      <td className="max-w-[180px] truncate px-3 py-2 font-medium text-white">
                        {item.reviewFileName || item.reviewId.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2 text-white/70">
                        {item.reviewUserName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/70">
                        #{item.findingIndex + 1}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1">
                          <SeverityDot severity={item.severity} />
                          <span className="capitalize text-white/70">
                            {item.severity}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <ResolutionBadge status={item.currentResolution} />
                      </td>
                      <td className="px-3 py-2 text-white/50">
                        {new Date(item.deadline).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="tabular-nums text-red-400">
                          {daysOverdue}d
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <a
                          href={`/review/${item.reviewId}`}
                          className="inline-flex items-center text-blue-400 hover:text-blue-300"
                          title="Open review"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          No overdue findings. All SLAs are on track.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? "border-red-500/20 bg-red-500/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-white/40">{label}</span>
      </div>
      <div
        className={`text-xl font-semibold ${
          highlight ? "text-red-400" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500",
    major: "bg-orange-500",
    medium: "bg-amber-500",
    minor: "bg-yellow-500",
    low: "bg-blue-500",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        colors[severity] || "bg-slate-500"
      }`}
    />
  );
}

function ResolutionBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-slate-500/15 text-slate-400",
    addressing: "bg-amber-500/15 text-amber-400",
    resolved: "bg-green-500/15 text-green-400",
    dismissed: "bg-red-500/15 text-red-400",
  };
  return (
    <span
      className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${
        styles[status] || styles.open
      }`}
    >
      {status}
    </span>
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
