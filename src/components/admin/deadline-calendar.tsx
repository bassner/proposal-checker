"use client";

import { useEffect, useState, useCallback } from "react";
import type { DeadlineRow, DeadlineAnalytics, DaySubmission } from "@/lib/db";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Calendar,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Get the first day of the month (0 = Sunday, adjusted to Monday-start). */
function getMonthStart(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  // Convert Sunday=0 to Monday-start: Mon=0, Tue=1, ..., Sun=6
  return day === 0 ? 6 : day - 1;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatMonth(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Pad a single-digit number with leading zero. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Format YYYY-MM-DD for a given date. */
function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/** Score to color class for review dots. */
function scoreColor(avgScore: number): string {
  if (avgScore >= 2.5) return "bg-emerald-400";
  if (avgScore >= 1.5) return "bg-amber-400";
  return "bg-red-400";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeadlineCalendar() {
  const [data, setData] = useState<DeadlineAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Calendar nav
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // Add deadline form
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formDesc, setFormDesc] = useState("");

  // Tooltip
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deadlines");
      if (!res.ok) throw new Error("Failed to load deadlines");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDate) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          deadline: new Date(formDate).toISOString(),
          description: formDesc.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to create deadline");
      }
      setFormTitle("");
      setFormDate("");
      setFormDesc("");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/deadlines?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete deadline");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error}
      </div>
    );
  }

  // Build lookup maps
  const deadlines = data?.deadlines ?? [];
  const dailyMap = new Map<string, DaySubmission>();
  for (const ds of data?.dailySubmissions ?? []) {
    dailyMap.set(ds.date, ds);
  }

  const deadlinesByDate = new Map<string, DeadlineRow[]>();
  for (const dl of deadlines) {
    const key = dl.deadline.split("T")[0];
    const existing = deadlinesByDate.get(key) ?? [];
    existing.push(dl);
    deadlinesByDate.set(key, existing);
  }

  // Calendar grid
  const startOffset = getMonthStart(viewYear, viewMonth);
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const totalCells = startOffset + daysInMonth;
  const rows = Math.ceil(totalCells / 7);

  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div>
      {/* Error banner (non-blocking) */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Add Deadline Form */}
      <form
        onSubmit={handleAdd}
        className="mb-4 flex flex-wrap items-end gap-2"
      >
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-white/40">Title</label>
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="e.g. Proposal Submission"
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-white/40">Deadline</label>
          <input
            type="datetime-local"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-blue-500/50 focus:outline-none [color-scheme:dark]"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-white/40">
            Description <span className="text-white/20">(optional)</span>
          </label>
          <input
            type="text"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder="Short note..."
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !formTitle.trim() || !formDate}
          className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Add Deadline
        </button>
      </form>

      {/* Month navigation */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded-md border border-white/10 p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[160px] text-center text-sm font-medium text-white">
            {formatMonth(viewYear, viewMonth)}
          </span>
          <button
            onClick={nextMonth}
            className="rounded-md border border-white/10 p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={goToday}
          className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Calendar className="h-3 w-3" />
          Today
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th
                  key={day}
                  className="border border-white/5 px-1 py-1.5 text-center text-[10px] font-medium text-white/30"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, rowIdx) => (
              <tr key={rowIdx}>
                {Array.from({ length: 7 }, (_, colIdx) => {
                  const cellIdx = rowIdx * 7 + colIdx;
                  const dayNum = cellIdx - startOffset + 1;
                  const isInMonth = dayNum >= 1 && dayNum <= daysInMonth;

                  if (!isInMonth) {
                    return (
                      <td
                        key={colIdx}
                        className="border border-white/5 bg-white/[0.01] p-1"
                        style={{ minWidth: 90, height: 72 }}
                      />
                    );
                  }

                  const dateKey = toDateKey(viewYear, viewMonth, dayNum);
                  const isToday = dateKey === todayKey;
                  const dayDeadlines = deadlinesByDate.get(dateKey) ?? [];
                  const daySub = dailyMap.get(dateKey);

                  return (
                    <td
                      key={colIdx}
                      className={`border border-white/5 p-1 align-top transition-colors ${
                        isToday
                          ? "bg-blue-500/10"
                          : "bg-white/[0.02] hover:bg-white/[0.04]"
                      }`}
                      style={{ minWidth: 90, height: 72 }}
                    >
                      {/* Day number */}
                      <div className="flex items-start justify-between">
                        <span
                          className={`text-[11px] font-medium ${
                            isToday ? "text-blue-400" : "text-white/50"
                          }`}
                        >
                          {dayNum}
                        </span>
                      </div>

                      {/* Deadline markers */}
                      {dayDeadlines.map((dl) => (
                        <div
                          key={dl.id}
                          className="group mt-0.5 flex items-center gap-1"
                          onMouseEnter={(e) => {
                            const rect = (
                              e.currentTarget as HTMLElement
                            ).getBoundingClientRect();
                            setTooltip({
                              x: rect.left + rect.width / 2,
                              y: rect.top - 4,
                              content: `Deadline: ${dl.title}${dl.description ? ` -- ${dl.description}` : ""}`,
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                          <span className="truncate text-[9px] text-red-400/80">
                            {dl.title}
                          </span>
                          <button
                            onClick={() => handleDelete(dl.id)}
                            className="ml-auto hidden shrink-0 rounded p-0.5 text-white/20 transition-colors hover:bg-red-500/20 hover:text-red-400 group-hover:block"
                            aria-label={`Delete deadline: ${dl.title}`}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}

                      {/* Submission dots */}
                      {daySub && (
                        <div
                          className="mt-0.5 flex items-center gap-0.5"
                          onMouseEnter={(e) => {
                            const rect = (
                              e.currentTarget as HTMLElement
                            ).getBoundingClientRect();
                            setTooltip({
                              x: rect.left + rect.width / 2,
                              y: rect.top - 4,
                              content: `${daySub.count} review${daySub.count !== 1 ? "s" : ""} -- avg ${daySub.avgFindings} findings -- quality: ${
                                daySub.avgScore >= 2.5
                                  ? "good"
                                  : daySub.avgScore >= 1.5
                                    ? "acceptable"
                                    : "needs-work"
                              }`,
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {Array.from(
                            { length: Math.min(daySub.count, 5) },
                            (_, i) => (
                              <span
                                key={i}
                                className={`h-1.5 w-1.5 rounded-full ${scoreColor(daySub.avgScore)}`}
                              />
                            )
                          )}
                          {daySub.count > 5 && (
                            <span className="text-[8px] text-white/30">
                              +{daySub.count - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Tooltip (portal-like, fixed position) */}
        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-md bg-slate-800 px-2.5 py-1.5 text-[10px] text-white shadow-lg ring-1 ring-white/10"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.content}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-white/40">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Deadline
        </div>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Review (good)
        </div>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Review (acceptable)
        </div>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          Review (needs-work)
        </div>
      </div>

      {/* Existing deadlines list */}
      {deadlines.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-[10px] font-medium text-white/30 uppercase tracking-wider">
            All Deadlines
          </h4>
          <div className="space-y-1">
            {deadlines.map((dl) => (
              <div
                key={dl.id}
                className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-xs"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                <span className="font-medium text-white/70">{dl.title}</span>
                <span className="text-white/30">
                  {new Date(dl.deadline).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {dl.description && (
                  <span className="text-white/20">{dl.description}</span>
                )}
                <button
                  onClick={() => handleDelete(dl.id)}
                  className="ml-auto rounded p-0.5 text-white/20 transition-colors hover:bg-red-500/20 hover:text-red-400"
                  aria-label={`Delete deadline: ${dl.title}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
