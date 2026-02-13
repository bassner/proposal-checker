"use client";

import { useEffect, useState } from "react";
import type { ApprovalStats } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Loader2,
  Check,
  X,
  AlertTriangle,
  BarChart3,
  Hash,
} from "lucide-react";

interface Props {
  initialData?: ApprovalStats | null;
}

export function ApprovalStatsDashboard({ initialData }: Props) {
  const [data, setData] = useState<ApprovalStats | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/approval-stats");
        if (!res.ok) throw new Error("Failed to load approval stats");
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
        {error || "Approval stats unavailable"}
      </div>
    );
  }

  const { totals, byCategory, byCheckGroup } = data;

  if (totals.total === 0) {
    return (
      <p className="py-4 text-center text-xs text-white/30">
        No approval data yet. Statistics will appear after advisors review findings.
      </p>
    );
  }

  const approvalRate = totals.total > 0
    ? Math.round((totals.approved / totals.total) * 1000) / 10
    : 0;
  const disputeRate = totals.total > 0
    ? Math.round((totals.disputed / totals.total) * 1000) / 10
    : 0;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Hash className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-white/40">Total Reviewed</span>
          </div>
          <div className="text-xl font-semibold text-white">{totals.total}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-400" />
            <span className="text-xs text-white/40">Approved</span>
          </div>
          <div className="text-xl font-semibold text-white">
            {totals.approved}
            <span className="ml-1 text-sm text-white/30">({approvalRate}%)</span>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <X className="h-4 w-4 text-red-400" />
            <span className="text-xs text-white/40">Disputed</span>
          </div>
          <div className="text-xl font-semibold text-white">
            {totals.disputed}
            <span className="ml-1 text-sm text-white/30">({disputeRate}%)</span>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-white/40">Needs Action</span>
          </div>
          <div className="text-xl font-semibold text-white">{totals.needsAction}</div>
        </div>
      </div>

      {/* Most disputed categories */}
      {byCategory.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-white/40" />
            <span className="text-xs font-medium text-white/60">
              Approval Status by Category
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/40">
                  <th className="pb-2 pr-3 font-medium">Category</th>
                  <th className="pb-2 pr-3 font-medium text-center">Total</th>
                  <th className="pb-2 pr-3 font-medium text-center">Approved</th>
                  <th className="pb-2 pr-3 font-medium text-center">Disputed</th>
                  <th className="pb-2 pr-3 font-medium text-center">Needs Action</th>
                  <th className="pb-2 font-medium text-right">Dispute Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {byCategory.map((row) => {
                  const rate = row.total > 0 ? Math.round((row.disputed / row.total) * 1000) / 10 : 0;
                  return (
                    <tr key={row.category}>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium capitalize text-white/70">{row.category}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-center text-white/50">{row.total}</td>
                      <td className="py-2.5 pr-3 text-center">
                        {row.approved > 0 ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500/20 px-1.5 text-[10px] font-medium text-green-400">
                            {row.approved}
                          </span>
                        ) : (
                          <span className="text-white/20">0</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-center">
                        {row.disputed > 0 ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/20 px-1.5 text-[10px] font-medium text-red-400">
                            {row.disputed}
                          </span>
                        ) : (
                          <span className="text-white/20">0</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-center">
                        {row.needsAction > 0 ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-medium text-amber-400">
                            {row.needsAction}
                          </span>
                        ) : (
                          <span className="text-white/20">0</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                            getDisputeRateColor(rate)
                          )}
                        >
                          {rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approval rate by check group */}
      {byCheckGroup.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-white/40" />
            <span className="text-xs font-medium text-white/60">
              Approval Rate by Check Group
            </span>
          </div>
          <div className="space-y-2">
            {byCheckGroup.map((row) => {
              const approvedPct = row.total > 0 ? (row.approved / row.total) * 100 : 0;
              const disputedPct = row.total > 0 ? (row.disputed / row.total) * 100 : 0;
              const needsActionPct = row.total > 0 ? (row.needsAction / row.total) * 100 : 0;
              return (
                <div key={row.checkGroup} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="capitalize text-white/60">{row.checkGroup}</span>
                    <span className="text-white/40">{row.total} reviewed</span>
                  </div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
                    {approvedPct > 0 && (
                      <div
                        className="h-full bg-green-500/70"
                        style={{ width: `${approvedPct}%` }}
                        title={`Approved: ${Math.round(approvedPct)}%`}
                      />
                    )}
                    {needsActionPct > 0 && (
                      <div
                        className="h-full bg-amber-500/70"
                        style={{ width: `${needsActionPct}%` }}
                        title={`Needs Action: ${Math.round(needsActionPct)}%`}
                      />
                    )}
                    {disputedPct > 0 && (
                      <div
                        className="h-full bg-red-500/70"
                        style={{ width: `${disputedPct}%` }}
                        title={`Disputed: ${Math.round(disputedPct)}%`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="mt-2 flex items-center gap-4 text-[10px] text-white/40">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500/70" />
              Approved
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-amber-500/70" />
              Needs Action
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-red-500/70" />
              Disputed
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getDisputeRateColor(rate: number): string {
  if (rate <= 10) return "bg-green-500/20 text-green-400";
  if (rate <= 30) return "bg-yellow-500/20 text-yellow-400";
  return "bg-red-500/20 text-red-400";
}
