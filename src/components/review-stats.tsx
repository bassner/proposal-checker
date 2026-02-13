"use client";

import { useState, useMemo } from "react";
import type { MergedFeedback, Severity, Annotations, Finding } from "@/types/review";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ChevronDown,
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  FileText,
  CheckCircle2,
  Layers,
} from "lucide-react";

interface ReviewStatsProps {
  feedback: MergedFeedback;
  annotations?: Annotations;
}

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "suggestion"];

const severityMeta: Record<
  Severity,
  { label: string; color: string; bg: string; barColor: string; icon: typeof AlertOctagon }
> = {
  critical: { label: "Critical", color: "text-red-400", bg: "bg-red-500/15", barColor: "bg-red-500", icon: AlertOctagon },
  major: { label: "Major", color: "text-orange-400", bg: "bg-orange-500/15", barColor: "bg-orange-500", icon: AlertTriangle },
  minor: { label: "Minor", color: "text-yellow-400", bg: "bg-yellow-500/15", barColor: "bg-yellow-400", icon: AlertCircle },
  suggestion: { label: "Suggestions", color: "text-blue-400", bg: "bg-blue-500/15", barColor: "bg-blue-500", icon: Lightbulb },
};

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

/** SVG progress ring component. */
function ProgressRing({
  progress,
  size = 48,
  strokeWidth = 4,
  className,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} className={cn("-rotate-90", className)}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-white/10"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-emerald-400 transition-all duration-500"
      />
    </svg>
  );
}

export function ReviewStats({ feedback, annotations }: ReviewStatsProps) {
  const [expanded, setExpanded] = useState(true);

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

  // Page density
  const referencedPages = useMemo(() => getReferencedPages(findings), [findings]);
  const pageCount = referencedPages.size;
  const density = pageCount > 0 ? (totalFindings / pageCount).toFixed(1) : "0";

  // Annotation progress
  const addressedCount = useMemo(() => {
    if (!annotations) return 0;
    return Object.values(annotations).filter((e) => e.status).length;
  }, [annotations]);
  const hasAnnotations = annotations != null && Object.keys(annotations).length > 0;
  const annotationProgress = totalFindings > 0 ? addressedCount / totalFindings : 0;

  // Category breakdown
  const categoryGroups = useMemo(() => groupByCategory(findings), [findings]);
  const categoriesWithIssues = categoryGroups.size;
  const categoriesSorted = useMemo(() => {
    return [...categoryGroups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [categoryGroups]);

  if (totalFindings === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header (always visible) */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={expanded}
        aria-controls="review-stats-content"
      >
        <BarChart3 className="h-4 w-4 shrink-0 text-white/40" />
        <span className="flex-1 text-sm font-medium text-white/70">Review Statistics</span>
        <span className="text-xs text-white/30">{totalFindings} finding{totalFindings !== 1 ? "s" : ""}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-white/30 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div id="review-stats-content" className="border-t border-white/5 px-4 pb-4 pt-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Severity breakdown bar chart */}
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

            {/* 2. Page density */}
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                <FileText className="h-3 w-3" />
                Page Density
              </h3>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums text-white/80">{density}</span>
                <span className="text-[11px] text-white/30">findings/page</span>
              </div>
              <p className="text-[10px] text-white/25">
                {totalFindings} finding{totalFindings !== 1 ? "s" : ""} across {pageCount} page{pageCount !== 1 ? "s" : ""}
              </p>
            </div>

            {/* 3. Annotation progress (only if annotations exist) */}
            {hasAnnotations && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  <CheckCircle2 className="h-3 w-3" />
                  Progress
                </h3>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <ProgressRing progress={annotationProgress} size={48} strokeWidth={4} />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-white/70">
                      {Math.round(annotationProgress * 100)}%
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-white/60">
                      <span className="font-semibold text-emerald-400">{addressedCount}</span>
                      <span className="text-white/30"> / {totalFindings}</span>
                    </p>
                    <p className="text-[10px] text-white/25">addressed</p>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Category coverage */}
            <div className={cn("space-y-2", !hasAnnotations && "sm:col-span-2")}>
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                <BarChart3 className="h-3 w-3" />
                By Category
              </h3>
              <div className="space-y-1">
                {categoriesSorted.map(([category, items]) => {
                  const hasCritical = items.some((f) => f.severity === "critical");
                  const hasMajor = items.some((f) => f.severity === "major");
                  return (
                    <div key={category} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-white/50">{category}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {hasCritical && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                        {hasMajor && !hasCritical && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
                        <span className="text-[10px] font-medium tabular-nums text-white/40">{items.length}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {categoriesWithIssues > 0 && (
                <p className="text-[10px] text-white/20">
                  {categoriesWithIssues} categor{categoriesWithIssues === 1 ? "y" : "ies"} with findings
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
