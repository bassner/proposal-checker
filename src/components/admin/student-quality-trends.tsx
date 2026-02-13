"use client";

import { useEffect, useState, useCallback } from "react";
import type { StudentSummary, StudentTrendData } from "@/lib/db";
import {
  AlertCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Users,
  BarChart3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// SVG line chart (no external chart library)
// ---------------------------------------------------------------------------

interface ChartPoint {
  x: number;
  y: number;
  label: string;
  score: number;
  assessment: string | null;
}

function TrendChart({ data }: { data: StudentTrendData }) {
  const { points } = data;
  if (points.length === 0) return null;

  const padding = { top: 20, right: 20, bottom: 40, left: 44 };
  const width = 700;
  const height = 260;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Score range: always 0-100
  const minY = 0;
  const maxY = 100;

  // Map points to pixel coordinates
  const mapped: ChartPoint[] = points.map((p, i) => {
    const x = padding.left + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
    const y = padding.top + chartH - ((p.qualityScore - minY) / (maxY - minY)) * chartH;
    const dateStr = new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { x, y, label: dateStr, score: p.qualityScore, assessment: p.overallAssessment };
  });

  // Build polyline path
  const polyline = mapped.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Gradient area fill path
  const areaPath = `${polyline} L ${mapped[mapped.length - 1].x} ${padding.top + chartH} L ${mapped[0].x} ${padding.top + chartH} Z`;

  // Y-axis gridlines
  const yTicks = [0, 25, 50, 75, 100];

  // Color for a score
  function scoreColor(score: number): string {
    if (score >= 80) return "#34d399";   // emerald-400
    if (score >= 60) return "#facc15";   // yellow-400
    if (score >= 40) return "#fb923c";   // orange-400
    return "#f87171";                     // red-400
  }

  // Assessment dot outline color
  function assessmentColor(a: string | null): string {
    if (a === "good") return "#34d399";
    if (a === "acceptable") return "#fbbf24";
    return "#f87171";
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 260 }}>
      <defs>
        <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y-axis gridlines and labels */}
      {yTicks.map((tick) => {
        const y = padding.top + chartH - ((tick - minY) / (maxY - minY)) * chartH;
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="white"
              strokeOpacity="0.07"
              strokeDasharray="4 4"
            />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="white" fillOpacity="0.3" fontSize="10">
              {tick}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      {mapped.length > 1 && (
        <path d={areaPath} fill="url(#area-gradient)" />
      )}

      {/* Line */}
      {mapped.length > 1 && (
        <path d={polyline} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
      )}

      {/* Data points */}
      {mapped.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5" fill="#0f172a" stroke={assessmentColor(p.assessment)} strokeWidth="2" />
          <circle cx={p.x} cy={p.y} r="2.5" fill={scoreColor(p.score)} />
          {/* X-axis date label (show all if <= 8 points, otherwise every other) */}
          {(points.length <= 8 || i % Math.ceil(points.length / 8) === 0 || i === points.length - 1) && (
            <text
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              fill="white"
              fillOpacity="0.3"
              fontSize="9"
            >
              {p.label}
            </text>
          )}
          {/* Score tooltip above point */}
          <text
            x={p.x}
            y={p.y - 10}
            textAnchor="middle"
            fill="white"
            fillOpacity="0.5"
            fontSize="9"
            fontWeight="500"
          >
            {p.score}
          </text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={12} y={padding.top + chartH / 2} textAnchor="middle" fill="white" fillOpacity="0.2" fontSize="10" transform={`rotate(-90, 12, ${padding.top + chartH / 2})`}>
        Score
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Category breakdown mini-bars (most recent review)
// ---------------------------------------------------------------------------

function CategoryBreakdown({ data }: { data: StudentTrendData }) {
  const latest = data.points[data.points.length - 1];
  if (!latest || latest.categoryBreakdown.length === 0) return null;

  const maxDeduction = Math.max(...latest.categoryBreakdown.map((c) => c.deduction), 1);

  return (
    <div className="mt-3">
      <h4 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-white/30">
        Latest Review -- Category Deductions
      </h4>
      <div className="space-y-1">
        {latest.categoryBreakdown.map((cat) => (
          <div key={cat.category} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 truncate text-right text-white/40 capitalize">{cat.category}</span>
            <div className="flex-1">
              <div
                className="h-2 rounded-full bg-blue-400/50"
                style={{ width: `${Math.max(4, (cat.deduction / maxDeduction) * 100)}%` }}
              />
            </div>
            <span className="w-12 text-right tabular-nums text-white/50">
              -{cat.deduction} ({cat.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend arrow/icon
// ---------------------------------------------------------------------------

function TrendIcon({ trend }: { trend: "improving" | "declining" | "stable" }) {
  if (trend === "improving") {
    return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  }
  if (trend === "declining") {
    return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  }
  return <Minus className="h-3.5 w-3.5 text-white/30" />;
}

function trendLabel(trend: "improving" | "declining" | "stable") {
  const config = {
    improving: { text: "Improving", color: "text-emerald-400" },
    declining: { text: "Declining", color: "text-red-400" },
    stable: { text: "Stable", color: "text-white/40" },
  };
  const c = config[trend];
  return <span className={`text-[10px] font-medium ${c.color}`}>{c.text}</span>;
}

// ---------------------------------------------------------------------------
// Expandable row with trend chart
// ---------------------------------------------------------------------------

function StudentRow({ student }: { student: StudentSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [trendData, setTrendData] = useState<StudentTrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrend = useCallback(async () => {
    if (trendData || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/student-trends?userId=${encodeURIComponent(student.userId)}`);
      if (!res.ok) throw new Error("Failed to load trend data");
      const json = await res.json();
      setTrendData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [student.userId, trendData, loading]);

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) loadTrend();
  };

  // Score color
  const scoreColor =
    student.avgScore >= 80
      ? "text-emerald-400"
      : student.avgScore >= 60
        ? "text-yellow-400"
        : student.avgScore >= 40
          ? "text-orange-400"
          : "text-red-400";

  return (
    <>
      <tr
        className="cursor-pointer border-b border-white/5 hover:bg-white/5 transition-colors"
        onClick={handleToggle}
      >
        <td className="px-3 py-2.5">
          <div className="font-medium text-white">{student.userName || "Unknown"}</div>
          <div className="text-[10px] text-white/30">{student.userEmail}</div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-white/70">
          {student.reviewCount}
        </td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${scoreColor}`}>
          {student.avgScore}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-center gap-1">
            <TrendIcon trend={student.trend} />
            {trendLabel(student.trend)}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right text-white/30 text-[10px]">
          {new Date(student.lastReviewDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </td>
        <td className="px-3 py-2.5 text-center">
          {expanded ? (
            <ChevronUp className="inline h-3.5 w-3.5 text-white/30" />
          ) : (
            <ChevronDown className="inline h-3.5 w-3.5 text-white/30" />
          )}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={6} className="border-b border-white/10 bg-white/[0.02] px-4 py-4">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}
            {trendData && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs font-medium text-white/50">
                    Quality Score Over Time ({trendData.points.length} review{trendData.points.length !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <TrendChart data={trendData} />
                </div>
                <CategoryBreakdown data={trendData} />
              </div>
            )}
            {!loading && !error && !trendData && (
              <p className="text-center text-xs text-white/30">No trend data available.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StudentQualityTrends() {
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/student-trends");
        if (!res.ok) throw new Error("Failed to load student summaries");
        const json = await res.json();
        if (!cancelled) setStudents(json.students);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  if (error || !students) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error || "Student data unavailable"}
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-white/30">
        No completed reviews yet. Student quality trends will appear once reviews are completed.
      </p>
    );
  }

  // Summary counts
  const improving = students.filter((s) => s.trend === "improving").length;
  const declining = students.filter((s) => s.trend === "declining").length;

  return (
    <div className="space-y-4">
      {/* Quick summary */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <Users className="h-4 w-4 text-blue-400" />
          <div>
            <div className="text-lg font-bold tabular-nums text-white">{students.length}</div>
            <div className="text-[10px] text-white/30">Students</div>
          </div>
        </div>
        {improving > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <div>
              <div className="text-lg font-bold tabular-nums text-emerald-400">{improving}</div>
              <div className="text-[10px] text-emerald-400/50">Improving</div>
            </div>
          </div>
        )}
        {declining > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <div>
              <div className="text-lg font-bold tabular-nums text-red-400">{declining}</div>
              <div className="text-[10px] text-red-400/50">Declining</div>
            </div>
          </div>
        )}
      </div>

      {/* Student table */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-3 py-2 text-left font-medium text-white/50">Student</th>
              <th className="px-3 py-2 text-right font-medium text-white/50">Reviews</th>
              <th className="px-3 py-2 text-right font-medium text-white/50">Avg Score</th>
              <th className="px-3 py-2 text-center font-medium text-white/50">Trend</th>
              <th className="px-3 py-2 text-right font-medium text-white/50">Last Review</th>
              <th className="w-8 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <StudentRow key={s.userId} student={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
