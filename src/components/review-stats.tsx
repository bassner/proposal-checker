"use client";

import { useMemo } from "react";
import type { MergedFeedback, Severity, Annotations, Finding, CheckGroupState } from "@/types/review";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  Layers,
} from "lucide-react";

interface ReviewStatsProps {
  feedback: MergedFeedback;
  annotations?: Annotations;
  checkGroups?: CheckGroupState[];
}

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "suggestion"];

const severityMeta: Record<
  Severity,
  { label: string; color: string; barColor: string; icon: typeof AlertOctagon }
> = {
  critical: { label: "Critical", color: "text-red-400", barColor: "bg-red-500", icon: AlertOctagon },
  major: { label: "Major", color: "text-orange-400", barColor: "bg-orange-500", icon: AlertTriangle },
  minor: { label: "Minor", color: "text-yellow-400", barColor: "bg-yellow-400", icon: AlertCircle },
  suggestion: { label: "Suggestions", color: "text-blue-400", barColor: "bg-blue-500", icon: Lightbulb },
};

/** Category bar colors — cycle through a palette to differentiate visually. */
const CATEGORY_COLORS = [
  "bg-violet-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-indigo-500",
  "bg-rose-500",
  "bg-emerald-500",
];

/** Compute unique page numbers referenced by all findings. */
function getReferencedPages(findings: Finding[]): Set<number> {
  const pages = new Set<number>();
  for (const f of findings) {
    for (const loc of f.locations) {
      if (loc.page != null) pages.add(loc.page);
    }
  }
  return pages;
}

/** Group findings by their category string. */
function groupByCategory(findings: Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.category || "Uncategorized";
    const list = map.get(key) ?? [];
    list.push(f);
    map.set(key, list);
  }
  return map;
}

export function ReviewStats({ feedback, annotations }: ReviewStatsProps) {
  const findings = feedback.findings;
  const totalFindings = findings.length;

  // Severity counts
  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, major: 0, minor: 0, suggestion: 0 };
    for (const f of findings) {
      counts[f.severity]++;
    }
    return counts;
  }, [findings]);

  const maxSeverityCount = Math.max(...Object.values(severityCounts), 1);

  // Page density (moved to header hint)
  const referencedPages = useMemo(() => getReferencedPages(findings), [findings]);
  const pageCount = referencedPages.size;

  // Annotation progress
  const addressedCount = useMemo(() => {
    if (!annotations) return 0;
    return Object.values(annotations).filter((e) => e.status).length;
  }, [annotations]);
  const hasAnnotations = annotations != null && Object.keys(annotations).length > 0;
  const annotationProgress = totalFindings > 0 ? addressedCount / totalFindings : 0;

  // Category breakdown
  const categoryGroups = useMemo(() => groupByCategory(findings), [findings]);
  const categoriesSorted = useMemo(() => {
    return [...categoryGroups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [categoryGroups]);
  const maxCategoryCount = categoriesSorted.length > 0 ? categoriesSorted[0][1].length : 1;

  if (totalFindings === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <BarChart3 className="h-4 w-4 shrink-0 text-white/40" />
        <span className="flex-1 text-sm font-medium text-white/70">Review Statistics</span>
        <span className="text-xs text-white/30">
          {totalFindings} finding{totalFindings !== 1 ? "s" : ""}
          {pageCount > 0 && <span> across {pageCount} page{pageCount !== 1 ? "s" : ""}</span>}
        </span>
      </div>

      {/* Two-column bar charts: Severity + Category */}
      <div className="border-t border-white/5 px-4 pb-3 pt-3">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Severity breakdown */}
          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              <Layers className="h-3 w-3" />
              By Severity
            </h3>
            <div className="space-y-1.5">
              {SEVERITY_ORDER.map((sev) => {
                const count = severityCounts[sev];
                const meta = severityMeta[sev];
                const SevIcon = meta.icon;
                const widthPercent = (count / maxSeverityCount) * 100;
                return (
                  <div key={sev} className="flex items-center gap-2">
                    <SevIcon className={cn("h-3 w-3 shrink-0", meta.color)} aria-hidden />
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-white/50">{meta.label}</span>
                        <span className={cn("font-bold tabular-nums", count > 0 ? meta.color : "text-white/20")}>
                          {count}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-white/5">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", meta.barColor)}
                          style={{ width: count > 0 ? `${Math.max(widthPercent, 4)}%` : "0%" }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category breakdown — horizontal bar chart */}
          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              <BarChart3 className="h-3 w-3" />
              By Category
            </h3>
            <div className="space-y-1.5">
              {categoriesSorted.map(([category, items], idx) => {
                const widthPercent = (items.length / maxCategoryCount) * 100;
                const barColor = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                return (
                  <div key={category} className="flex items-center gap-2">
                    <div className={cn("h-3 w-3 shrink-0 rounded-sm", barColor)} style={{ opacity: 0.7 }} aria-hidden />
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="truncate text-white/50">{category}</span>
                        <span className="font-bold tabular-nums text-white/40">{items.length}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-white/5">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", barColor)}
                          style={{ width: `${Math.max(widthPercent, 4)}%`, opacity: 0.7 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar (full-width, bottom) — only if annotations exist */}
      {hasAnnotations && (
        <div className="border-t border-white/5 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-white/30" />
            <div className="flex-1">
              <div className="h-1.5 rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.max(annotationProgress * 100, addressedCount > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
            <span className="text-[11px] tabular-nums text-white/40">
              <span className="font-semibold text-emerald-400">{addressedCount}</span>
              <span className="text-white/25"> / {totalFindings} addressed</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
