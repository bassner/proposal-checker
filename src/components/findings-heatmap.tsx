"use client";

import { useState, useMemo, useCallback } from "react";
import type { Finding, Severity } from "@/types/review";
import { getPageDensity, type PageDensityMap } from "@/lib/findings-analysis";
import { cn } from "@/lib/utils";
import { MapPin, ChevronDown } from "lucide-react";

interface FindingsHeatmapProps {
  findings: Finding[];
  onPageClick?: (page: number) => void;
  /** Currently selected page (highlighted + used for filtering findings). */
  activePage?: number | null;
  className?: string;
}

const SEVERITY_COLORS: Record<Severity, { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "Critical" },
  major: { dot: "bg-orange-500", label: "Major" },
  minor: { dot: "bg-yellow-400", label: "Minor" },
  suggestion: { dot: "bg-blue-500", label: "Suggestion" },
};

/** Background + border classes for a page thumbnail based on finding count. */
function getPageColors(count: number): { bg: string; border: string; text: string } {
  if (count === 0) return { bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-400/60" };
  if (count <= 2) return { bg: "bg-yellow-500/15", border: "border-yellow-500/30", text: "text-yellow-400" };
  if (count <= 4) return { bg: "bg-orange-500/20", border: "border-orange-500/35", text: "text-orange-400" };
  return { bg: "bg-red-500/25", border: "border-red-500/40", text: "text-red-400" };
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

/** Severity dot indicators inside a page thumbnail. */
function SeverityDots({ bySeverity }: { bySeverity: Record<Severity, number> }) {
  const sevs: Severity[] = ["critical", "major", "minor", "suggestion"];
  const present = sevs.filter((s) => bySeverity[s] > 0);
  if (present.length === 0) return null;

  return (
    <div className="mt-auto flex items-center justify-center gap-[3px]">
      {present.map((sev) => (
        <span
          key={sev}
          className={cn("h-[5px] w-[5px] rounded-full", SEVERITY_COLORS[sev].dot)}
        />
      ))}
    </div>
  );
}

export function FindingsHeatmap({ findings, onPageClick, activePage, className }: FindingsHeatmapProps) {
  const [expanded, setExpanded] = useState(true);
  const [hoveredPage, setHoveredPage] = useState<number | null>(null);

  const density = useMemo(() => getPageDensity(findings), [findings]);
  const pages = useMemo(() => getPageRange(density), [density]);
  const unlocated = density.get(-1);

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

  const handlePageClickCb = useCallback(
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
              { label: "Clean", bg: "bg-emerald-500/10", border: "border-emerald-500/25" },
              { label: "1–2", bg: "bg-yellow-500/15", border: "border-yellow-500/30" },
              { label: "3–4", bg: "bg-orange-500/20", border: "border-orange-500/35" },
              { label: "5+", bg: "bg-red-500/25", border: "border-red-500/40" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <span className={cn("h-3 w-2.5 rounded-[2px] border", item.bg, item.border)} />
                <span className="text-[10px] text-white/30">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Page grid */}
          <div className="flex flex-wrap gap-2">
            {allPages.map((page) => {
              const entry = density.get(page);
              const count = entry?.total ?? 0;
              const colors = getPageColors(count);
              const isHovered = hoveredPage === page;
              const isActive = activePage === page;

              return (
                <div key={page} className="relative">
                  {/* Tooltip */}
                  {isHovered && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2">
                      <TooltipContent
                        page={page}
                        total={count}
                        bySeverity={entry?.bySeverity ?? { critical: 0, major: 0, minor: 0, suggestion: 0 }}
                      />
                    </div>
                  )}

                  {/* Page thumbnail */}
                  <button
                    type="button"
                    onClick={() => handlePageClickCb(page)}
                    onMouseEnter={() => setHoveredPage(page)}
                    onMouseLeave={() => setHoveredPage(null)}
                    className={cn(
                      "flex w-12 flex-col items-center rounded-[3px] border px-1 pb-1.5 pt-1 transition-all duration-150",
                      colors.bg,
                      colors.border,
                      onPageClick && "cursor-pointer",
                      isHovered && !isActive && "brightness-125 scale-105",
                      isActive && "ring-2 ring-blue-400 scale-105",
                    )}
                    style={{ aspectRatio: "3 / 4" }}
                    aria-label={`Page ${page}: ${count} finding${count !== 1 ? "s" : ""}${isActive ? " (active filter)" : ""}`}
                    aria-pressed={isActive}
                  >
                    {/* Fake text lines */}
                    <div className="w-full flex-1 space-y-[3px] pt-0.5">
                      <div className="h-[2px] w-3/4 rounded-full bg-white/[0.07]" />
                      <div className="h-[2px] w-full rounded-full bg-white/[0.07]" />
                      <div className="h-[2px] w-5/6 rounded-full bg-white/[0.07]" />
                      <div className="h-[2px] w-full rounded-full bg-white/[0.07]" />
                      <div className="h-[2px] w-2/3 rounded-full bg-white/[0.07]" />
                    </div>

                    {/* Severity dots */}
                    {entry && <SeverityDots bySeverity={entry.bySeverity} />}

                    {/* Finding count badge */}
                    {count > 0 && (
                      <span className={cn("mt-0.5 text-[9px] font-bold tabular-nums leading-none", colors.text)}>
                        {count}
                      </span>
                    )}
                  </button>

                  {/* Page number */}
                  <p className={cn(
                    "mt-1 text-center text-[9px] tabular-nums",
                    isActive ? "font-bold text-blue-400" : "text-white/25",
                  )}>
                    {page}
                  </p>
                </div>
              );
            })}

            {/* Unlocated findings */}
            {unlocated && unlocated.total > 0 && (
              <div className="relative">
                {hoveredPage === -1 && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2">
                    <TooltipContent
                      page="unlocated"
                      total={unlocated.total}
                      bySeverity={unlocated.bySeverity}
                    />
                  </div>
                )}
                <div
                  onMouseEnter={() => setHoveredPage(-1)}
                  onMouseLeave={() => setHoveredPage(null)}
                  className={cn(
                    "flex w-12 flex-col items-center rounded-[3px] border border-dashed border-white/15 bg-white/[0.03] px-1 pb-1.5 pt-1 transition-all duration-150",
                    hoveredPage === -1 && "brightness-125 scale-105",
                  )}
                  style={{ aspectRatio: "3 / 4" }}
                  role="img"
                  aria-label={`Unlocated: ${unlocated.total} finding${unlocated.total !== 1 ? "s" : ""}`}
                >
                  <div className="flex flex-1 items-center justify-center">
                    <span className="text-[9px] text-white/20">?</span>
                  </div>
                  <SeverityDots bySeverity={unlocated.bySeverity} />
                  <span className="mt-0.5 text-[9px] font-bold tabular-nums leading-none text-white/40">
                    {unlocated.total}
                  </span>
                </div>
                <p className="mt-1 text-center text-[9px] text-white/25">N/A</p>
              </div>
            )}
          </div>

          {/* Summary line */}
          <div className="mt-3 flex items-center gap-2">
            <p className="text-[10px] text-white/20">
              {findings.length} finding{findings.length !== 1 ? "s" : ""} across{" "}
              {pages.length} page{pages.length !== 1 ? "s" : ""}
              {unlocated && unlocated.total > 0 ? ` + ${unlocated.total} unlocated` : ""}
            </p>
            {activePage != null && (
              <button
                type="button"
                onClick={() => onPageClick?.(activePage)}
                className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400 transition-colors hover:bg-blue-500/25"
              >
                Filtering: Page {activePage}
                <span aria-hidden>&times;</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
