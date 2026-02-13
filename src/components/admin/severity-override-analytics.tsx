"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, Loader2, ArrowRight, TrendingUp, TrendingDown, BarChart3, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeverityOverrideStats } from "@/lib/db";

// ---------------------------------------------------------------------------
// Severity display metadata
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-500" },
  major: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-500" },
  minor: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-500" },
  suggestion: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-500" },
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  suggestion: "Suggestion",
};

function severityColor(severity: string) {
  return SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.suggestion;
}

function severityLabel(severity: string) {
  return SEVERITY_LABELS[severity] ?? severity;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  initialData?: SeverityOverrideStats | null;
}

export function SeverityOverrideAnalytics({ initialData }: Props) {
  const [data, setData] = useState<SeverityOverrideStats | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/severity-override-stats");
      if (!res.ok) throw new Error("Failed to load severity override stats");
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
    fetchData();
  }, [initialData, fetchData]);

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
        {error || "Severity override data unavailable"}
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-6 text-sm text-white/40">
        <BarChart3 className="h-4 w-4" />
        No severity overrides recorded yet.
      </div>
    );
  }

  const maxTransitionCount = Math.max(...data.transitions.map((t) => t.count), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-white/40">
            <BarChart3 className="h-3.5 w-3.5" />
            Total overrides
          </div>
          <div className="mt-1 text-2xl font-semibold text-white/90">
            {data.total}
          </div>
        </div>

        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-white/40">
            <TrendingUp className="h-3.5 w-3.5 text-red-400" />
            Upgrades (more severe)
          </div>
          <div className="mt-1 text-2xl font-semibold text-red-400">
            {data.upgrades}
          </div>
          <div className="text-[10px] text-white/30">
            {data.total > 0
              ? `${((data.upgrades / data.total) * 100).toFixed(0)}% of overrides`
              : ""}
          </div>
        </div>

        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-white/40">
            <TrendingDown className="h-3.5 w-3.5 text-green-400" />
            Downgrades (less severe)
          </div>
          <div className="mt-1 text-2xl font-semibold text-green-400">
            {data.downgrades}
          </div>
          <div className="text-[10px] text-white/30">
            {data.total > 0
              ? `${((data.downgrades / data.total) * 100).toFixed(0)}% of overrides`
              : ""}
          </div>
        </div>
      </div>

      {/* Transition table (Sankey-style text) */}
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-white/60">
          <ArrowRight className="h-3.5 w-3.5" />
          Severity transitions
        </h3>
        <div className="space-y-2">
          {data.transitions.map((t) => {
            const fromColor = severityColor(t.originalSeverity);
            const toColor = severityColor(t.newSeverity);
            const barWidth = (t.count / maxTransitionCount) * 100;

            return (
              <div key={`${t.originalSeverity}-${t.newSeverity}`} className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  {/* From badge */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      fromColor.bg,
                      fromColor.text
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", fromColor.dot)} />
                    {severityLabel(t.originalSeverity)}
                  </span>

                  <ArrowRight className="h-3 w-3 text-white/20" />

                  {/* To badge */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      toColor.bg,
                      toColor.text
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", toColor.dot)} />
                    {severityLabel(t.newSeverity)}
                  </span>

                  <span className="ml-auto text-[11px] font-medium text-white/50">
                    {t.count}x
                  </span>
                </div>

                {/* Bar */}
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className={cn("h-full rounded-full", toColor.bg)}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top overriders */}
      {data.topOverriders.length > 0 && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-white/60">
            <Users className="h-3.5 w-3.5" />
            Top overriders
          </h3>
          <div className="space-y-1.5">
            {data.topOverriders.map((o, i) => {
              const barWidth =
                (o.count / (data.topOverriders[0]?.count ?? 1)) * 100;
              return (
                <div key={o.userId} className="flex items-center gap-2">
                  <span className="w-5 text-right text-[10px] font-medium text-white/25">
                    {i + 1}.
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-white/60">
                    {o.userName || o.userId}
                  </span>
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-blue-500/30"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[11px] font-medium text-white/50">
                    {o.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
