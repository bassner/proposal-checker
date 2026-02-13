"use client";

import { useState, useMemo, useCallback } from "react";
import { Loader2, AlertCircle, RefreshCw, Grid3x3 } from "lucide-react";
import { FINDING_CATEGORIES } from "@/types/review";
import type { FindingCategory } from "@/types/review";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImpactMatrixCell {
  category: string;
  severity: string;
  count: number;
}

interface ImpactMatrixData {
  cells: ImpactMatrixCell[];
  totalReviews: number;
}

interface Props {
  initialData: ImpactMatrixData | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITIES = ["critical", "major", "minor", "suggestion"] as const;

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  major: "bg-orange-500",
  minor: "bg-yellow-500",
  suggestion: "bg-blue-500",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  suggestion: "Suggestion",
};

/** All known finding categories for rows, in display order. */
const CATEGORIES = Object.keys(FINDING_CATEGORIES) as FindingCategory[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute background colour with opacity proportional to the cell's count
 * relative to the maximum count in the matrix. Uses a severity-specific
 * hue so the heatmap conveys both density and severity at a glance.
 */
function cellStyle(
  count: number,
  maxCount: number,
  severity: string
): React.CSSProperties {
  if (count === 0 || maxCount === 0) {
    return { backgroundColor: "rgba(255,255,255,0.02)" };
  }
  const intensity = Math.max(0.08, count / maxCount);
  const colorMap: Record<string, string> = {
    critical: `rgba(239,68,68,${intensity})`,   // red-500
    major: `rgba(249,115,22,${intensity})`,      // orange-500
    minor: `rgba(234,179,8,${intensity})`,       // yellow-500
    suggestion: `rgba(59,130,246,${intensity})`,  // blue-500
  };
  return {
    backgroundColor: colorMap[severity] ?? `rgba(148,163,184,${intensity})`,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImpactMatrixDashboard({ initialData }: Props) {
  const [data, setData] = useState<ImpactMatrixData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ category: string; severity: string } | null>(null);

  // Build lookup: category -> severity -> count
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const cat of CATEGORIES) {
      m[cat] = {};
      for (const sev of SEVERITIES) {
        m[cat][sev] = 0;
      }
    }
    if (data) {
      for (const cell of data.cells) {
        const cat = cell.category as string;
        if (m[cat]) {
          m[cat][cell.severity] = cell.count;
        }
      }
    }
    return m;
  }, [data]);

  // Totals
  const { rowTotals, colTotals, grandTotal, maxCount } = useMemo(() => {
    const rt: Record<string, number> = {};
    const ct: Record<string, number> = {};
    let gt = 0;
    let mx = 0;
    for (const sev of SEVERITIES) ct[sev] = 0;
    for (const cat of CATEGORIES) {
      rt[cat] = 0;
      for (const sev of SEVERITIES) {
        const v = matrix[cat]?.[sev] ?? 0;
        rt[cat] += v;
        ct[sev] += v;
        gt += v;
        if (v > mx) mx = v;
      }
    }
    return { rowTotals: rt, colTotals: ct, grandTotal: gt, maxCount: mx };
  }, [matrix]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/impact-matrix");
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to load impact matrix");
      }
      const { data: newData } = await res.json();
      setData(newData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const pct = useCallback(
    (count: number) => (grandTotal > 0 ? ((count / grandTotal) * 100).toFixed(1) : "0.0"),
    [grandTotal]
  );

  // Tooltip content for hovered cell
  const tooltip = useMemo(() => {
    if (!hoveredCell) return null;
    const count = matrix[hoveredCell.category]?.[hoveredCell.severity] ?? 0;
    const catMeta = FINDING_CATEGORIES[hoveredCell.category as FindingCategory];
    return {
      category: catMeta?.label ?? hoveredCell.category,
      severity: SEVERITY_LABELS[hoveredCell.severity] ?? hoveredCell.severity,
      count,
      pct: pct(count),
    };
  }, [hoveredCell, matrix, pct]);

  if (!data && !error) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Grid3x3 className="h-8 w-8 text-white/20" />
        <p className="text-xs text-white/40">
          No impact matrix data available. Database may be unavailable.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Error banner */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
        <span className="text-[10px] text-white/30">
          {data?.totalReviews ?? 0} completed review{(data?.totalReviews ?? 0) !== 1 ? "s" : ""} &middot; {grandTotal} total finding{grandTotal !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-white/30">
                Category
              </th>
              {SEVERITIES.map((sev) => (
                <th
                  key={sev}
                  className="px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-white/30"
                >
                  {SEVERITY_LABELS[sev]}
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-white/30">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => {
              const catMeta = FINDING_CATEGORIES[cat];
              return (
                <tr key={cat} className="border-t border-white/5">
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${catMeta.bgClass} ${catMeta.textClass}`}>
                      {catMeta.label}
                    </span>
                  </td>
                  {SEVERITIES.map((sev) => {
                    const count = matrix[cat]?.[sev] ?? 0;
                    const isHovered = hoveredCell?.category === cat && hoveredCell?.severity === sev;
                    return (
                      <td
                        key={sev}
                        className="relative px-1 py-1"
                        onMouseEnter={() => setHoveredCell({ category: cat, severity: sev })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div
                          className="flex h-9 items-center justify-center rounded-md text-xs font-medium text-white/80 transition-all"
                          style={cellStyle(count, maxCount, sev)}
                        >
                          {count > 0 ? count : <span className="text-white/15">&ndash;</span>}
                        </div>
                        {/* Tooltip */}
                        {isHovered && count > 0 && (
                          <div className="pointer-events-none absolute -top-14 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-[10px] text-white shadow-xl">
                            <div className="font-medium">{tooltip?.category} / {tooltip?.severity}</div>
                            <div className="text-white/50">{tooltip?.count} finding{tooltip?.count !== 1 ? "s" : ""} ({tooltip?.pct}%)</div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center font-medium text-white/50">
                    {rowTotals[cat] ?? 0}
                  </td>
                </tr>
              );
            })}

            {/* Summary row */}
            <tr className="border-t border-white/10">
              <td className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white/30">
                Total
              </td>
              {SEVERITIES.map((sev) => (
                <td key={sev} className="px-2 py-1.5 text-center font-medium text-white/50">
                  {colTotals[sev] ?? 0}
                </td>
              ))}
              <td className="px-2 py-1.5 text-center font-bold text-white/70">
                {grandTotal}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Color scale legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="text-[10px] text-white/30">Intensity scale:</span>
        {SEVERITIES.map((sev) => (
          <div key={sev} className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              <div className={`h-3 w-3 rounded-sm ${SEVERITY_COLORS[sev]} opacity-10`} />
              <div className={`h-3 w-3 rounded-sm ${SEVERITY_COLORS[sev]} opacity-30`} />
              <div className={`h-3 w-3 rounded-sm ${SEVERITY_COLORS[sev]} opacity-60`} />
              <div className={`h-3 w-3 rounded-sm ${SEVERITY_COLORS[sev]} opacity-100`} />
            </div>
            <span className="text-[10px] text-white/40">{SEVERITY_LABELS[sev]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
