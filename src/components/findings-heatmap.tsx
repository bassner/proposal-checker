"use client";

import { useState, useMemo, useCallback } from "react";
import type { Finding, Severity } from "@/types/review";
import { getPageDensity, type PageDensityMap } from "@/lib/findings-analysis";
import { cn } from "@/lib/utils";
import { MapPin, ChevronDown } from "lucide-react";

interface FindingsHeatmapProps {
  findings: Finding[];
  onPageClick?: (page: number) => void;
  className?: string;
}

const SEVERITY_COLORS: Record<Severity, { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "Critical" },
  major: { dot: "bg-orange-500", label: "Major" },
  minor: { dot: "bg-yellow-400", label: "Minor" },
  suggestion: { dot: "bg-blue-500", label: "Suggestion" },
};

/** Map a finding count to a color class for the bar. */
function getBarColor(count: number): string {
  if (count === 0) return "bg-emerald-500/40";
  if (count <= 2) return "bg-yellow-500/70";
  if (count <= 4) return "bg-orange-500/80";
  return "bg-red-500/90";
}

/** Map a finding count to a background color class for the bar container on hover. */
function getBarHoverBg(count: number): string {
  if (count === 0) return "hover:bg-emerald-500/10";
  if (count <= 2) return "hover:bg-yellow-500/10";
  if (count <= 4) return "hover:bg-orange-500/10";
  return "hover:bg-red-500/10";
}

/** Derive the max page from density map (ignoring -1 for unlocated). */
function getPageRange(density: PageDensityMap): number[] {
  const pages: number[] = [];
  for (const page of density.keys()) {
    if (page !== -1) pages.push(page);
  }
  pages.sort((a, b) => a - b);
  return pages;
}

function TooltipContent({
  page,
  total,
  bySeverity,
}: {
  page: number | "unlocated";
  total: number;
  bySeverity: Record<Severity, number>;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 shadow-xl">
      <p className="text-[11px] font-semibold text-white/80">
        {page === "unlocated" ? "Unlocated" : `Page ${page}`}
      </p>
      <p className="text-[10px] text-white/40">
        {total} finding{total !== 1 ? "s" : ""}
      </p>
      {total > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {(["critical", "major", "minor", "suggestion"] as Severity[]).map((sev) => {
            const count = bySeverity[sev];
            if (count === 0) return null;
            const meta = SEVERITY_COLORS[sev];
            return (
              <div key={sev} className="flex items-center gap-1.5 text-[10px]">
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                <span className="text-white/50">{meta.label}</span>
                <span className="ml-auto font-medium tabular-nums text-white/70">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FindingsHeatmap({ findings, onPageClick, className }: FindingsHeatmapProps) {
  const [expanded, setExpanded] = useState(true);
  const [hoveredPage, setHoveredPage] = useState<number | null>(null);

  const density = useMemo(() => getPageDensity(findings), [findings]);
  const pages = useMemo(() => getPageRange(density), [density]);
  const unlocated = density.get(-1);

  const maxCount = useMemo(() => {
    let max = 1;
    for (const [, entry] of density) {
      if (entry.total > max) max = entry.total;
    }
    return max;
  }, [density]);

  // Fill gaps: show all pages from 1 to max, even those with 0 findings
  const maxPage = pages.length > 0 ? pages[pages.length - 1] : 0;
  const allPages = useMemo(() => {
    if (maxPage === 0) return [];
    const result: number[] = [];
    for (let i = 1; i <= maxPage; i++) {
      result.push(i);
    }
    return result;
  }, [maxPage]);

  const handleBarClick = useCallback(
    (page: number) => {
      onPageClick?.(page);
    },
    [onPageClick],
  );

  if (findings.length === 0 || (allPages.length === 0 && !unlocated)) return null;

  const hotspotCount = pages.filter((p) => (density.get(p)?.total ?? 0) >= 3).length;

  return (
    <div className={cn("rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={expanded}
        aria-controls="findings-heatmap-content"
      >
        <MapPin className="h-4 w-4 shrink-0 text-white/40" />
        <span className="flex-1 text-sm font-medium text-white/70">Page Heatmap</span>
        <span className="text-xs text-white/30">
          {hotspotCount > 0
            ? `${hotspotCount} hotspot${hotspotCount !== 1 ? "s" : ""}`
            : `${pages.length} page${pages.length !== 1 ? "s" : ""}`}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-white/30 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* Content */}
      {expanded && (
        <div id="findings-heatmap-content" className="border-t border-white/5 px-4 pb-4 pt-3">
          {/* Legend */}
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[10px] text-white/25">Density:</span>
            {[
              { label: "0", color: "bg-emerald-500/40" },
              { label: "1-2", color: "bg-yellow-500/70" },
              { label: "3-4", color: "bg-orange-500/80" },
              { label: "5+", color: "bg-red-500/90" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <span className={cn("h-2 w-3 rounded-sm", item.color)} />
                <span className="text-[10px] text-white/30">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Heatmap bars */}
          <div className="overflow-x-auto">
            <div className="flex items-end gap-[3px]" style={{ minWidth: allPages.length > 20 ? `${allPages.length * 24}px` : undefined }}>
              {allPages.map((page) => {
                const entry = density.get(page);
                const count = entry?.total ?? 0;
                const heightPct = maxCount > 0 ? Math.max((count / maxCount) * 100, 6) : 6;
                const isHovered = hoveredPage === page;

                return (
                  <div
                    key={page}
                    className="relative flex flex-1 flex-col items-center"
                    style={{ minWidth: "20px" }}
                  >
                    {/* Tooltip */}
                    {isHovered && entry && (
                      <div className="pointer-events-none absolute bottom-full z-10 mb-1">
                        <TooltipContent
                          page={page}
                          total={entry.total}
                          bySeverity={entry.bySeverity}
                        />
                      </div>
                    )}
                    {isHovered && !entry && (
                      <div className="pointer-events-none absolute bottom-full z-10 mb-1">
                        <TooltipContent
                          page={page}
                          total={0}
                          bySeverity={{ critical: 0, major: 0, minor: 0, suggestion: 0 }}
                        />
                      </div>
                    )}

                    {/* Bar */}
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-t-sm transition-all duration-150",
                        getBarColor(count),
                        getBarHoverBg(count),
                        onPageClick && "cursor-pointer",
                        isHovered && "ring-1 ring-white/30",
                      )}
                      style={{ height: `${heightPct}%`, minHeight: "4px", maxHeight: "64px" }}
                      onClick={() => handleBarClick(page)}
                      onMouseEnter={() => setHoveredPage(page)}
                      onMouseLeave={() => setHoveredPage(null)}
                      aria-label={`Page ${page}: ${count} finding${count !== 1 ? "s" : ""}`}
                    />

                    {/* Page label */}
                    <span className="mt-1 text-[9px] tabular-nums text-white/25">{page}</span>
                  </div>
                );
              })}

              {/* Unlocated findings */}
              {unlocated && unlocated.total > 0 && (
                <>
                  {allPages.length > 0 && (
                    <div className="mx-1 self-stretch border-l border-dashed border-white/10" />
                  )}
                  <div
                    className="relative flex flex-col items-center"
                    style={{ minWidth: "36px" }}
                  >
                    {hoveredPage === -1 && (
                      <div className="pointer-events-none absolute bottom-full z-10 mb-1">
                        <TooltipContent
                          page="unlocated"
                          total={unlocated.total}
                          bySeverity={unlocated.bySeverity}
                        />
                      </div>
                    )}
                    <div
                      className={cn(
                        "w-full rounded-t-sm transition-all duration-150",
                        getBarColor(unlocated.total),
                        hoveredPage === -1 && "ring-1 ring-white/30",
                      )}
                      style={{
                        height: `${Math.max((unlocated.total / maxCount) * 100, 6)}%`,
                        minHeight: "4px",
                        maxHeight: "64px",
                      }}
                      onMouseEnter={() => setHoveredPage(-1)}
                      onMouseLeave={() => setHoveredPage(null)}
                      role="img"
                      aria-label={`Unlocated: ${unlocated.total} finding${unlocated.total !== 1 ? "s" : ""}`}
                    />
                    <span className="mt-1 text-[9px] text-white/25">N/A</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Summary line */}
          <p className="mt-2 text-[10px] text-white/20">
            {findings.length} finding{findings.length !== 1 ? "s" : ""} across{" "}
            {pages.length} page{pages.length !== 1 ? "s" : ""}
            {unlocated && unlocated.total > 0 ? ` + ${unlocated.total} unlocated` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
