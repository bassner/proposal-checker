"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { PeerPairingRow, StrengthProfile } from "@/lib/db";
import type { FindingCategory } from "@/types/review";
import { FINDING_CATEGORY_VALUES, FINDING_CATEGORIES } from "@/types/review";
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Check,
  X,
  Filter,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Spider chart SVG (7-9 axes for finding categories)
// ---------------------------------------------------------------------------

const CHART_CATEGORIES = FINDING_CATEGORY_VALUES.filter((c) => c !== "other");
const CHART_SIZE = 200;
const CHART_CENTER = CHART_SIZE / 2;
const CHART_RADIUS = 75;
const CHART_LEVELS = 4;

function SpiderChart({ profile }: { profile: StrengthProfile }) {
  const n = CHART_CATEGORIES.length;
  const angleStep = (2 * Math.PI) / n;
  // Offset so first axis points up
  const angleOffset = -Math.PI / 2;

  // Find max value across all categories for scaling
  const maxVal = Math.max(
    ...CHART_CATEGORIES.map((c) => profile.categoryScores[c]),
    1
  );

  function polarToXY(angle: number, radius: number): [number, number] {
    return [
      CHART_CENTER + radius * Math.cos(angle),
      CHART_CENTER + radius * Math.sin(angle),
    ];
  }

  // Grid levels (concentric polygons)
  const gridPolygons = Array.from({ length: CHART_LEVELS }, (_, level) => {
    const r = (CHART_RADIUS * (level + 1)) / CHART_LEVELS;
    const points = Array.from({ length: n }, (_, i) => {
      const [x, y] = polarToXY(angleOffset + i * angleStep, r);
      return `${x},${y}`;
    }).join(" ");
    return points;
  });

  // Data polygon: invert scale so FEWER findings = LARGER radius (stronger)
  const dataPoints = CHART_CATEGORIES.map((cat, i) => {
    const val = profile.categoryScores[cat];
    // Invert: 0 findings = max radius, maxVal findings = 0 radius
    const normalized = maxVal > 0 ? 1 - val / maxVal : 1;
    const r = CHART_RADIUS * Math.max(normalized, 0.05);
    return polarToXY(angleOffset + i * angleStep, r);
  });

  const dataPolygon = dataPoints.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg
      width={CHART_SIZE}
      height={CHART_SIZE}
      viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
      className="shrink-0"
    >
      {/* Grid */}
      {gridPolygons.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.5}
        />
      ))}

      {/* Axes */}
      {CHART_CATEGORIES.map((_, i) => {
        const [x, y] = polarToXY(
          angleOffset + i * angleStep,
          CHART_RADIUS
        );
        return (
          <line
            key={i}
            x1={CHART_CENTER}
            y1={CHART_CENTER}
            x2={x}
            y2={y}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Data area */}
      <polygon
        points={dataPolygon}
        fill="rgba(59,130,246,0.2)"
        stroke="rgba(59,130,246,0.7)"
        strokeWidth={1.5}
      />

      {/* Data points */}
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill="rgb(59,130,246)" />
      ))}

      {/* Labels */}
      {CHART_CATEGORIES.map((cat, i) => {
        const labelR = CHART_RADIUS + 18;
        const [x, y] = polarToXY(angleOffset + i * angleStep, labelR);
        const meta = FINDING_CATEGORIES[cat];
        return (
          <text
            key={cat}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.5)"
            fontSize={8}
            fontFamily="system-ui, sans-serif"
          >
            {meta.label}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Profile tooltip (shown on hover)
// ---------------------------------------------------------------------------

function ProfileTooltip({
  userId,
  anchorRect,
}: {
  userId: string;
  anchorRect: DOMRect | null;
}) {
  const [profile, setProfile] = useState<StrengthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/peer-pairings?profileFor=${encodeURIComponent(userId)}`
        );
        if (!res.ok) throw new Error("Failed to load profile");
        const json = await res.json();
        if (!cancelled) setProfile(json.profile);
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
  }, [userId]);

  if (!anchorRect) return null;

  // Position tooltip to the right of the anchor element, or left if near edge
  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.max(8, anchorRect.top - 60),
    left: anchorRect.right + 8,
    zIndex: 50,
  };

  return (
    <div
      style={tooltipStyle}
      className="w-64 rounded-xl border border-white/10 bg-slate-900/95 p-3 shadow-xl backdrop-blur-sm"
    >
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-white/40" />
        </div>
      )}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      {profile && (
        <div>
          <p className="mb-1 text-xs font-medium text-white">
            {profile.userName}
          </p>
          <p className="mb-2 text-[10px] text-white/40">
            {profile.reviewCount} review{profile.reviewCount !== 1 ? "s" : ""} analyzed
          </p>
          <div className="flex justify-center">
            <SpiderChart profile={profile} />
          </div>
          <div className="mt-2 space-y-0.5">
            {CHART_CATEGORIES.map((cat) => {
              const val = profile.categoryScores[cat];
              const meta = FINDING_CATEGORIES[cat];
              return (
                <div
                  key={cat}
                  className="flex items-center justify-between text-[10px]"
                >
                  <span className={meta.textClass}>{meta.label}</span>
                  <span className="tabular-nums text-white/50">
                    {val.toFixed(1)} avg
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

// ---------------------------------------------------------------------------
// Hoverable student name
// ---------------------------------------------------------------------------

function StudentName({
  userId,
  name,
}: {
  userId: string;
  name: string | null;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEnter = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (ref.current) {
      setAnchorRect(ref.current.getBoundingClientRect());
    }
    setShowTooltip(true);
  }, []);

  const handleLeave = useCallback(() => {
    hideTimer.current = setTimeout(() => setShowTooltip(false), 200);
  }, []);

  return (
    <>
      <span
        ref={ref}
        className="cursor-help border-b border-dotted border-white/20 text-white hover:border-white/40"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {name || "Unknown"}
      </span>
      {showTooltip && <ProfileTooltip userId={userId} anchorRect={anchorRect} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    suggested:
      "border-blue-500/30 bg-blue-500/10 text-blue-400",
    accepted:
      "border-green-500/30 bg-green-500/10 text-green-400",
    rejected:
      "border-red-500/30 bg-red-500/10 text-red-400",
  };

  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${styles[status] ?? styles.suggested}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard component
// ---------------------------------------------------------------------------

type StatusFilter = "all" | "suggested" | "accepted" | "rejected";

export function PeerPairingDashboard() {
  const [pairings, setPairings] = useState<PeerPairingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const fetchPairings = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) setGenerating(true);
        else setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (refresh) params.set("refresh", "true");
        else if (statusFilter !== "all") params.set("status", statusFilter);

        const res = await fetch(
          `/api/admin/peer-pairings?${params.toString()}`
        );
        if (!res.ok) throw new Error("Failed to load peer pairings");
        const json = await res.json();
        setPairings(json.pairings ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
        setGenerating(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  const handleStatusUpdate = useCallback(
    async (pairingId: string, newStatus: "accepted" | "rejected") => {
      setUpdatingIds((prev) => new Set(prev).add(pairingId));
      try {
        const res = await fetch("/api/admin/peer-pairings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairingId, status: newStatus }),
        });
        if (!res.ok) throw new Error("Failed to update pairing");
        const json = await res.json();
        setPairings((prev) =>
          prev.map((p) => (p.id === pairingId ? json.pairing : p))
        );
      } catch (err) {
        console.error("Failed to update pairing:", err);
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(pairingId);
          return next;
        });
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error}
      </div>
    );
  }

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "suggested", label: "Suggested" },
    { value: "accepted", label: "Accepted" },
    { value: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => fetchPairings(true)}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {generating ? "Generating..." : "Generate New Pairings"}
        </button>

        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-white/30" />
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:bg-white/5 hover:text-white/60"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[10px] text-white/30">
          {pairings.length} pairing{pairings.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Empty state */}
      {pairings.length === 0 && (
        <p className="py-8 text-center text-xs text-white/30">
          No peer pairings found. Click &quot;Generate New Pairings&quot; to
          analyze student reviews and create complementary matches.
        </p>
      )}

      {/* Pairings table */}
      {pairings.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-3 py-2 text-left font-medium text-white/50">
                  Student A
                </th>
                <th className="px-3 py-2 text-left font-medium text-white/50">
                  Student B
                </th>
                <th className="px-3 py-2 text-left font-medium text-white/50">
                  Strength Area
                </th>
                <th className="px-3 py-2 text-left font-medium text-white/50">
                  Weakness Area
                </th>
                <th className="px-3 py-2 text-right font-medium text-white/50">
                  Match Score
                </th>
                <th className="px-3 py-2 text-center font-medium text-white/50">
                  Status
                </th>
                <th className="px-3 py-2 text-center font-medium text-white/50">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {pairings.map((p) => {
                const isUpdating = updatingIds.has(p.id);
                const strengthMeta =
                  FINDING_CATEGORIES[
                    p.strengthArea as FindingCategory
                  ] ?? FINDING_CATEGORIES.other;
                const weaknessMeta =
                  FINDING_CATEGORIES[
                    p.weaknessArea as FindingCategory
                  ] ?? FINDING_CATEGORIES.other;

                return (
                  <tr
                    key={p.id}
                    className="border-b border-white/5 hover:bg-white/5"
                  >
                    <td className="px-3 py-2">
                      <StudentName
                        userId={p.studentAId}
                        name={p.studentAName}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StudentName
                        userId={p.studentBId}
                        name={p.studentBName}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${strengthMeta.bgClass} ${strengthMeta.textClass}`}
                      >
                        {strengthMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${weaknessMeta.bgClass} ${weaknessMeta.textClass}`}
                      >
                        {weaknessMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">
                      {p.score.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {p.status === "suggested" && (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() =>
                              handleStatusUpdate(p.id, "accepted")
                            }
                            disabled={isUpdating}
                            title="Accept pairing"
                            className="rounded p-1 text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                          >
                            {isUpdating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              handleStatusUpdate(p.id, "rejected")
                            }
                            disabled={isUpdating}
                            title="Reject pairing"
                            className="rounded p-1 text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {p.status !== "suggested" && (
                        <span className="text-[10px] text-white/20">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
