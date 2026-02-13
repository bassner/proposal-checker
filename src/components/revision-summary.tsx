"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertCircle,
  Repeat2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FindingEntry {
  title: string;
  category: string;
  severity: string;
}

interface PersistentEntry {
  oldTitle: string;
  newTitle: string;
  category: string;
  similarity: number;
}

interface RevisionSummaryData {
  available: boolean;
  id?: string;
  oldReviewId?: string;
  newReviewId?: string;
  fixedCount?: number;
  newCount?: number;
  persistentCount?: number;
  summary?: {
    fixedFindings: FindingEntry[];
    newFindings: FindingEntry[];
    persistentFindings: PersistentEntry[];
    improvementPct: number;
  };
  createdAt?: string;
}

interface RevisionSummaryProps {
  /** The current review's ID (the "new" review). */
  reviewId: string;
  /** The old review's ID to compare against. If omitted, auto-detects from version group. */
  oldReviewId?: string;
}

// ---------------------------------------------------------------------------
// Severity display helpers
// ---------------------------------------------------------------------------

const severityColors: Record<string, string> = {
  critical: "text-red-400",
  major: "text-orange-400",
  minor: "text-yellow-400",
  suggestion: "text-blue-400",
};

function SeverityDot({ severity }: { severity: string }) {
  const color = severityColors[severity] ?? "text-slate-400";
  return (
    <span className={cn("inline-block size-2 rounded-full bg-current", color)} />
  );
}

// ---------------------------------------------------------------------------
// Expandable section
// ---------------------------------------------------------------------------

function Section({
  title,
  count,
  icon: Icon,
  iconColor,
  borderColor,
  bgColor,
  children,
}: {
  title: string;
  count: number;
  icon: typeof CheckCircle2;
  iconColor: string;
  borderColor: string;
  bgColor: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  if (count === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border-l-4 border border-white/5",
        borderColor,
        bgColor
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <Icon className={cn("size-4 shrink-0", iconColor)} />
        <span className="flex-1 text-sm font-medium text-slate-200">
          {title}
        </span>
        <span className={cn("text-sm font-bold", iconColor)}>{count}</span>
        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-slate-500" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RevisionSummary({ reviewId, oldReviewId }: RevisionSummaryProps) {
  const [data, setData] = useState<RevisionSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = oldReviewId ? `?oldReviewId=${oldReviewId}` : "";
      const res = await fetch(`/api/review/${reviewId}/revision-summary${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as RevisionSummaryData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, [reviewId, oldReviewId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleRegenerate = async () => {
    if (!data?.oldReviewId) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}/revision-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldReviewId: data.oldReviewId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      // Refresh after regeneration
      await fetchSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin text-slate-400" />
          <span className="text-sm text-slate-400">Loading revision summary...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  // Not available
  if (!data?.available || !data.summary) {
    return null;
  }

  const { summary, fixedCount = 0, newCount = 0, persistentCount = 0 } = data;
  const totalOldFindings = fixedCount + persistentCount;

  return (
    <div className="space-y-3">
      {/* Header with improvement percentage */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <TrendingUp className="size-4" />
            Revision Change Summary
          </h3>
          {data.oldReviewId && (
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
              title="Regenerate summary"
            >
              <RefreshCw className={cn("size-3", regenerating && "animate-spin")} />
              {regenerating ? "Regenerating..." : "Refresh"}
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Improvement</span>
            <span className={cn(
              "text-sm font-bold",
              summary.improvementPct >= 50 ? "text-emerald-400" :
              summary.improvementPct >= 25 ? "text-amber-400" :
              "text-slate-400"
            )}>
              {summary.improvementPct}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
            {totalOldFindings > 0 && (
              <div className="h-full flex">
                {/* Fixed portion (green) */}
                {fixedCount > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(fixedCount / totalOldFindings) * 100}%` }}
                  />
                )}
                {/* Persistent portion (amber) */}
                {persistentCount > 0 && (
                  <div
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${(persistentCount / totalOldFindings) * 100}%` }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stat pills */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-center">
            <p className="text-lg font-bold text-emerald-400">{fixedCount}</p>
            <p className="text-[10px] text-emerald-400/70">Fixed</p>
          </div>
          <div className="rounded-md bg-red-500/10 px-2 py-1.5 text-center">
            <p className="text-lg font-bold text-red-400">{newCount}</p>
            <p className="text-[10px] text-red-400/70">New</p>
          </div>
          <div className="rounded-md bg-amber-500/10 px-2 py-1.5 text-center">
            <p className="text-lg font-bold text-amber-400">{persistentCount}</p>
            <p className="text-[10px] text-amber-400/70">Persistent</p>
          </div>
        </div>
      </div>

      {/* Expandable sections */}
      <Section
        title="Fixed Findings"
        count={fixedCount}
        icon={CheckCircle2}
        iconColor="text-emerald-400"
        borderColor="border-l-emerald-500"
        bgColor="bg-emerald-500/[0.03]"
      >
        {summary.fixedFindings.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
            <SeverityDot severity={f.severity} />
            <span className="truncate">{f.title}</span>
            <span className="ml-auto shrink-0 text-[10px] text-slate-500">{f.category}</span>
          </div>
        ))}
      </Section>

      <Section
        title="New Findings"
        count={newCount}
        icon={AlertCircle}
        iconColor="text-red-400"
        borderColor="border-l-red-500"
        bgColor="bg-red-500/[0.03]"
      >
        {summary.newFindings.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
            <SeverityDot severity={f.severity} />
            <span className="truncate">{f.title}</span>
            <span className="ml-auto shrink-0 text-[10px] text-slate-500">{f.category}</span>
          </div>
        ))}
      </Section>

      <Section
        title="Persistent Findings"
        count={persistentCount}
        icon={Repeat2}
        iconColor="text-amber-400"
        borderColor="border-l-amber-500"
        bgColor="bg-amber-500/[0.03]"
      >
        {summary.persistentFindings.map((f, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <Repeat2 className="mt-0.5 size-3 shrink-0 text-amber-500/50" />
            <div className="flex-1 min-w-0">
              <span className="text-slate-300 truncate block">{f.newTitle}</span>
              {f.oldTitle !== f.newTitle && (
                <span className="text-[11px] text-slate-500 truncate block">
                  was: {f.oldTitle}
                </span>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-slate-500">{f.category}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}
