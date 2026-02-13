"use client";

import { useEffect, useState } from "react";
import type { FailedReviewsData } from "@/lib/db";
import {
  AlertCircle,
  Loader2,
  XCircle,
  Percent,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

interface Props {
  initialData: FailedReviewsData | null;
}

export function FailedReviewsDashboard({ initialData }: Props) {
  const [data, setData] = useState<FailedReviewsData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/failed-reviews");
        if (!res.ok) throw new Error("Failed to load failed reviews");
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
        {error || "Failed reviews data unavailable"}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-red-400" />
            <span className="text-xs text-white/40">Failed Reviews</span>
          </div>
          <div className="text-xl font-semibold text-white">{data.totalFailed}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Percent className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-white/40">Failure Rate</span>
          </div>
          <div className="text-xl font-semibold text-white">{data.failureRate}%</div>
        </div>
        <div className="col-span-2 rounded-lg border border-white/10 bg-white/5 p-3 sm:col-span-1">
          <div className="mb-1 flex items-center gap-1.5">
            <RefreshCw className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-white/40">With Retries</span>
          </div>
          <div className="text-xl font-semibold text-white">
            {data.reviews.filter((r) => r.retryCount > 0).length}
          </div>
        </div>
      </div>

      {/* Common errors */}
      {data.commonErrors.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-white/40">Most Common Errors</h3>
          <div className="space-y-1.5">
            {data.commonErrors.map((e, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-medium text-red-400">
                  {e.count}
                </span>
                <span className="min-w-0 break-words text-xs text-white/60">{truncateError(e.error)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed reviews table */}
      {data.reviews.length === 0 ? (
        <p className="py-4 text-center text-xs text-white/30">No failed reviews</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/40">
                <th className="pb-2 pr-3 font-medium">Date</th>
                <th className="pb-2 pr-3 font-medium">User</th>
                <th className="pb-2 pr-3 font-medium">File</th>
                <th className="pb-2 pr-3 font-medium">Provider</th>
                <th className="pb-2 pr-3 font-medium">Error</th>
                <th className="pb-2 pr-3 font-medium text-center">Retries</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.reviews.map((r) => (
                <tr key={r.id} className="group">
                  <td className="whitespace-nowrap py-2 pr-3 text-white/50">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="max-w-[120px] truncate py-2 pr-3 text-white/60" title={r.userEmail}>
                    {r.userName || r.userEmail}
                  </td>
                  <td className="max-w-[160px] truncate py-2 pr-3 text-white/60" title={r.fileName ?? undefined}>
                    {r.fileName || "-"}
                  </td>
                  <td className="py-2 pr-3 text-white/50">{r.provider}</td>
                  <td className="max-w-[200px] truncate py-2 pr-3 text-red-400/80" title={r.errorMessage ?? undefined}>
                    {r.errorMessage ? truncateError(r.errorMessage) : "-"}
                  </td>
                  <td className="py-2 pr-3 text-center text-white/50">
                    {r.retryCount > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-medium text-amber-400">
                        {r.retryCount}
                      </span>
                    ) : (
                      <span className="text-white/20">0</span>
                    )}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/review/${r.id}`}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-blue-400/70 opacity-0 transition-opacity hover:text-blue-400 group-hover:opacity-100"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>View</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function truncateError(msg: string): string {
  return msg.length > 120 ? msg.slice(0, 117) + "..." : msg;
}
