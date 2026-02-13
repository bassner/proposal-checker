"use client";

import { useEffect, useState, useCallback } from "react";
import type { ScoreTrendStudent, ScoreTrendsSummary, ScoreTrendPoint } from "@/lib/db";
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
  Award,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Sparkline (Unicode block chars for compact inline display)
// ---------------------------------------------------------------------------

function Sparkline({ points, width = 60 }: { points: ScoreTrendPoint[]; width?: number }) {
  if (points.length <= 1) {
    return <span className="text-[10px] text-white/20">--</span>;
  }

  const scores = points.map((p) => p.qualityScore);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  // Unicode block elements (8 levels from bottom to top)
  const blocks = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];

  // Sample down to fit width (max chars)
  const step = Math.max(1, Math.floor(scores.length / width));
  const sampled: number[] = [];
  for (let i = 0; i < scores.length; i += step) {
    sampled.push(scores[i]);
  }
  // Always include the last score
  if (sampled[sampled.length - 1] !== scores[scores.length - 1]) {
    sampled.push(scores[scores.length - 1]);
  }

  const sparkChars = sampled.map((s) => {
    const level = Math.min(7, Math.floor(((s - min) / range) * 7));
    return blocks[level];
  });

  // Color based on trend direction (first vs last)
  const first = sampled[0];
  const last = sampled[sampled.length - 1];
  const colorClass =
    last > first + 3 ? "text-emerald-400" :
    last < first - 3 ? "text-red-400" :
    "text-white/40";

  return (
    <span className={`font-mono text-xs leading-none tracking-tighter ${colorClass}`}>
      {sparkChars.join("")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SVG line chart for expanded view
// ---------------------------------------------------------------------------

interface ChartPoint {
  x: number;
  y: number;
  label: string;
  score: number;
  assessment: string | null;
}

function TrendChart({ points }: { points: ScoreTrendPoint[] }) {
  if (points.length === 0) return null;

  const padding = { top: 20, right: 20, bottom: 40, left: 44 };
  const width = 700;
  const height = 260;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minY = 0;
  const maxY = 100;

  const mapped: ChartPoint[] = points.map((p, i) => {
    const x = padding.left + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
    const y = padding.top + chartH - ((p.qualityScore - minY) / (maxY - minY)) * chartH;
    const dateStr = new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { x, y, label: dateStr, score: p.qualityScore, assessment: p.overallAssessment };
  });

  const polyline = mapped.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${polyline} L ${mapped[mapped.length - 1].x} ${padding.top + chartH} L ${mapped[0].x} ${padding.top + chartH} Z`;

  const yTicks = [0, 25, 50, 75, 100];

  function scoreColor(score: number): string {
    if (score >= 80) return "#34d399";
    if (score >= 60) return "#facc15";
    if (score >= 40) return "#fb923c";
    return "#f87171";
  }

  function assessmentColor(a: string | null): string {
    if (a === "good") return "#34d399";
    if (a === "acceptable") return "#fbbf24";
    return "#f87171";
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 260 }}>
      <defs>
        <linearGradient id="score-trend-area-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map((tick) => {
        const y = padding.top + chartH - ((tick - minY) / (maxY - minY)) * chartH;
        return (
          <g key={tick}>
            <line
              x1={padding.left} y1={y} x2={width - padding.right} y2={y}
              stroke="white" strokeOpacity="0.07" strokeDasharray="4 4"
            />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="white" fillOpacity="0.3" fontSize="10">
              {tick}
            </text>
          </g>
        );
      })}

      {mapped.length > 1 && <path d={areaPath} fill="url(#score-trend-area-gradient)" />}
      {mapped.length > 1 && (
        <path d={polyline} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
      )}

      {mapped.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5" fill="#0f172a" stroke={assessmentColor(p.assessment)} strokeWidth="2" />
          <circle cx={p.x} cy={p.y} r="2.5" fill={scoreColor(p.score)} />
          {(points.length <= 8 || i % Math.ceil(points.length / 8) === 0 || i === points.length - 1) && (
            <text x={p.x} y={height - 8} textAnchor="middle" fill="white" fillOpacity="0.3" fontSize="9">
              {p.label}
            </text>
          )}
          <text x={p.x} y={p.y - 10} textAnchor="middle" fill="white" fillOpacity="0.5" fontSize="9" fontWeight="500">
            {p.score}
          </text>
        </g>
      ))}

      <text
        x={12} y={padding.top + chartH / 2}
        textAnchor="middle" fill="white" fillOpacity="0.2" fontSize="10"
        transform={`rotate(-90, 12, ${padding.top + chartH / 2})`}
      >
        Score
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Trend icon & label helpers
// ---------------------------------------------------------------------------

function TrendIcon({ trend }: { trend: "improving" | "declining" | "stable" }) {
  if (trend === "improving") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (trend === "declining") return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
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
// Expandable student row
// ---------------------------------------------------------------------------

function StudentRow({ student }: { student: ScoreTrendStudent }) {
  const [expanded, setExpanded] = useState(false);

  const scoreColor =
    student.avgScore >= 80
      ? "text-emerald-400"
      : student.avgScore >= 60
        ? "text-yellow-400"
        : student.avgScore >= 40
          ? "text-orange-400"
          : "text-red-400";

  const rateColor =
    student.improvementRate > 0
      ? "text-emerald-400"
      : student.improvementRate < 0
        ? "text-red-400"
        : "text-white/30";

  return (
    <>
      <tr
        className="cursor-pointer border-b border-white/5 hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
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
        <td className="hidden px-3 py-2.5 sm:table-cell">
          <Sparkline points={student.points} />
        </td>
        <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${rateColor}`}>
          {student.improvementRate > 0 ? "+" : ""}{student.improvementRate}
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
          <td colSpan={8} className="border-b border-white/10 bg-white/[0.02] px-4 py-4">
            {student.points.length > 0 ? (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs font-medium text-white/50">
                    Quality Score Over Time ({student.points.length} review{student.points.length !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <TrendChart points={student.points} />
                </div>

                {/* Individual review scores list */}
                <div className="mt-3">
                  <h4 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-white/30">
                    Review History
                  </h4>
                  <div className="space-y-1">
                    {student.points.map((p) => {
                      const color =
                        p.qualityScore >= 80 ? "text-emerald-400" :
                        p.qualityScore >= 60 ? "text-yellow-400" :
                        p.qualityScore >= 40 ? "text-orange-400" : "text-red-400";
                      return (
                        <div key={p.reviewId} className="flex items-center gap-2 text-[11px]">
                          <span className="w-20 text-white/30">
                            {new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <span className={`w-8 text-right tabular-nums font-medium ${color}`}>
                            {p.qualityScore}
                          </span>
                          <div className="flex-1">
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width: `${p.qualityScore}%`,
                                backgroundColor:
                                  p.qualityScore >= 80 ? "#34d399" :
                                  p.qualityScore >= 60 ? "#facc15" :
                                  p.qualityScore >= 40 ? "#fb923c" : "#f87171",
                                opacity: 0.5,
                              }}
                            />
                          </div>
                          <span className="w-16 truncate text-right text-white/20 text-[10px]">
                            {p.findingCount} finding{p.findingCount !== 1 ? "s" : ""}
                          </span>
                          {p.fileName && (
                            <span className="hidden max-w-[120px] truncate text-white/15 text-[10px] sm:inline">
                              {p.fileName}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-white/30">No trend data available.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function SummaryCards({ summary, students }: { summary: ScoreTrendsSummary; students: ScoreTrendStudent[] }) {
  const avgScoreAll = students.length > 0
    ? Math.round(students.reduce((sum, s) => sum + s.avgScore, 0) / students.length * 10) / 10
    : 0;

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <Users className="h-4 w-4 text-blue-400" />
        <div>
          <div className="text-lg font-bold tabular-nums text-white">{summary.totalStudents}</div>
          <div className="text-[10px] text-white/30">Students</div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <BarChart3 className="h-4 w-4 text-blue-400" />
        <div>
          <div className="text-lg font-bold tabular-nums text-white">{avgScoreAll}</div>
          <div className="text-[10px] text-white/30">Avg Score</div>
        </div>
      </div>

      {summary.improvingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <div>
            <div className="text-lg font-bold tabular-nums text-emerald-400">{summary.improvingCount}</div>
            <div className="text-[10px] text-emerald-400/50">Improving</div>
          </div>
        </div>
      )}

      {summary.decliningCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <TrendingDown className="h-4 w-4 text-red-400" />
          <div>
            <div className="text-lg font-bold tabular-nums text-red-400">{summary.decliningCount}</div>
            <div className="text-[10px] text-red-400/50">Declining</div>
          </div>
        </div>
      )}

      {summary.bestImprover && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
          <Award className="h-4 w-4 text-emerald-400" />
          <div>
            <div className="text-xs font-medium text-emerald-400">{summary.bestImprover.userName || "Unknown"}</div>
            <div className="text-[10px] text-emerald-400/50">
              Best Improver (+{summary.bestImprover.improvementRate}/review)
            </div>
          </div>
        </div>
      )}

      {summary.worstTrending && summary.worstTrending.improvementRate < 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <div>
            <div className="text-xs font-medium text-red-400">{summary.worstTrending.userName || "Unknown"}</div>
            <div className="text-[10px] text-red-400/50">
              Needs Attention ({summary.worstTrending.improvementRate}/review)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard component
// ---------------------------------------------------------------------------

export function ScoreTrendsDashboard() {
  const [students, setStudents] = useState<ScoreTrendStudent[] | null>(null);
  const [summary, setSummary] = useState<ScoreTrendsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"avgScore" | "trend" | "reviewCount" | "improvementRate" | "lastReviewDate">("lastReviewDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/score-trends");
        if (!res.ok) throw new Error("Failed to load score trends");
        const json = await res.json();
        if (!cancelled) {
          setStudents(json.students);
          setSummary(json.summary);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSort = useCallback((col: typeof sortBy) => {
    setSortBy((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return col;
      }
      setSortDir("desc");
      return col;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  if (error || !students || !summary) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error || "Score trend data unavailable"}
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-white/30">
        No completed reviews yet. Score trends will appear once reviews are completed.
      </p>
    );
  }

  // Sort students
  const sorted = [...students].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortBy) {
      case "avgScore":
        return (a.avgScore - b.avgScore) * dir;
      case "reviewCount":
        return (a.reviewCount - b.reviewCount) * dir;
      case "improvementRate":
        return (a.improvementRate - b.improvementRate) * dir;
      case "trend": {
        const order = { improving: 2, stable: 1, declining: 0 };
        return (order[a.trend] - order[b.trend]) * dir;
      }
      case "lastReviewDate":
      default:
        return (new Date(a.lastReviewDate).getTime() - new Date(b.lastReviewDate).getTime()) * dir;
    }
  });

  const sortIndicator = (col: typeof sortBy) =>
    sortBy === col ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <SummaryCards summary={summary} students={students} />

      {/* Student table */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-3 py-2 text-left font-medium text-white/50">Student</th>
              <th
                className="cursor-pointer px-3 py-2 text-right font-medium text-white/50 hover:text-white/80"
                onClick={() => handleSort("reviewCount")}
              >
                Reviews{sortIndicator("reviewCount")}
              </th>
              <th
                className="cursor-pointer px-3 py-2 text-right font-medium text-white/50 hover:text-white/80"
                onClick={() => handleSort("avgScore")}
              >
                Avg Score{sortIndicator("avgScore")}
              </th>
              <th
                className="cursor-pointer px-3 py-2 text-center font-medium text-white/50 hover:text-white/80"
                onClick={() => handleSort("trend")}
              >
                Trend{sortIndicator("trend")}
              </th>
              <th className="hidden px-3 py-2 text-center font-medium text-white/50 sm:table-cell">Sparkline</th>
              <th
                className="cursor-pointer px-3 py-2 text-right font-medium text-white/50 hover:text-white/80"
                onClick={() => handleSort("improvementRate")}
              >
                Rate{sortIndicator("improvementRate")}
              </th>
              <th
                className="cursor-pointer px-3 py-2 text-right font-medium text-white/50 hover:text-white/80"
                onClick={() => handleSort("lastReviewDate")}
              >
                Last Review{sortIndicator("lastReviewDate")}
              </th>
              <th className="w-8 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <StudentRow key={s.userId} student={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
