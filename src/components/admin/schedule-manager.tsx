"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Pencil,
  X,
  Calendar,
  Users,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface Schedule {
  id: string;
  title: string;
  description: string | null;
  cronExpression: string;
  targetUsers: string[];
  provider: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdBy: string;
  createdAt: string;
}

type Frequency = "daily" | "weekly" | "monthly";

const WEEKDAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" },
];

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

function cronToHuman(cron: string): string {
  if (cron === "daily") return "Daily";
  if (cron.startsWith("weekly:")) {
    const day = parseInt(cron.split(":")[1], 10);
    const wd = WEEKDAYS.find((w) => w.value === String(day));
    return `Weekly on ${wd?.label ?? "?"}`;
  }
  if (cron.startsWith("monthly:")) {
    const day = parseInt(cron.split(":")[1], 10);
    const suffix = day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th";
    return `Monthly on the ${day}${suffix}`;
  }
  return cron;
}

function parseCronToForm(cron: string): {
  frequency: Frequency;
  weekDay: string;
  monthDay: number;
} {
  if (cron.startsWith("weekly:")) {
    return { frequency: "weekly", weekDay: cron.split(":")[1], monthDay: 1 };
  }
  if (cron.startsWith("monthly:")) {
    return {
      frequency: "monthly",
      weekDay: "1",
      monthDay: parseInt(cron.split(":")[1], 10),
    };
  }
  return { frequency: "daily", weekDay: "1", monthDay: 1 };
}

function formToCron(frequency: Frequency, weekDay: string, monthDay: number): string {
  if (frequency === "weekly") return `weekly:${weekDay}`;
  if (frequency === "monthly") return `monthly:${monthDay}`;
  return "daily";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  initialSchedules: Schedule[];
}

export function ScheduleManager({ initialSchedules }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFrequency, setFormFrequency] = useState<Frequency>("weekly");
  const [formWeekDay, setFormWeekDay] = useState("1");
  const [formMonthDay, setFormMonthDay] = useState(1);
  const [formProvider, setFormProvider] = useState("azure");
  const [formTargetUsers, setFormTargetUsers] = useState("");

  const clearError = useCallback(() => {
    setTimeout(() => setError(null), 5000);
  }, []);

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormFrequency("weekly");
    setFormWeekDay("1");
    setFormMonthDay(1);
    setFormProvider("azure");
    setFormTargetUsers("");
    setEditingId(null);
    setShowForm(false);
  };

  const populateFormForEdit = (s: Schedule) => {
    setFormTitle(s.title);
    setFormDescription(s.description ?? "");
    const parsed = parseCronToForm(s.cronExpression);
    setFormFrequency(parsed.frequency);
    setFormWeekDay(parsed.weekDay);
    setFormMonthDay(parsed.monthDay);
    setFormProvider(s.provider);
    setFormTargetUsers(s.targetUsers.join(", "));
    setEditingId(s.id);
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      setError("Title is required");
      clearError();
      return;
    }

    const cronExpression = formToCron(formFrequency, formWeekDay, formMonthDay);
    const targetUsers = formTargetUsers
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          cronExpression,
          targetUsers: targetUsers.length > 0 ? targetUsers : undefined,
          provider: formProvider,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create schedule");
      }
      const { schedule } = await res.json();
      setSchedules((prev) => [schedule, ...prev]);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      clearError();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !formTitle.trim()) {
      setError("Title is required");
      clearError();
      return;
    }

    const cronExpression = formToCron(formFrequency, formWeekDay, formMonthDay);
    const targetUsers = formTargetUsers
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          cronExpression,
          targetUsers,
          provider: formProvider,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update schedule");
      }
      const { schedule } = await res.json();
      setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? schedule : s)));
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      clearError();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s: Schedule) => {
    try {
      const res = await fetch("/api/admin/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, isActive: !s.isActive }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update");
      }
      const { schedule } = await res.json();
      setSchedules((prev) => prev.map((x) => (x.id === schedule.id ? schedule : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      clearError();
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/schedules?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to delete");
      }
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      clearError();
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Schedule list */}
      {schedules.length === 0 && !showForm && (
        <p className="mb-4 text-xs text-white/40">No schedules configured.</p>
      )}

      {schedules.length > 0 && (
        <div className="mb-4 space-y-3">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        s.isActive ? "bg-green-400" : "bg-white/20"
                      }`}
                    />
                    <span className="text-sm font-medium text-white/90 truncate">
                      {s.title}
                    </span>
                  </div>
                  {s.description && (
                    <p className="mt-1 text-xs text-white/40 line-clamp-2 ml-4">
                      {s.description}
                    </p>
                  )}
                  <div className="mt-2 ml-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/30">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {cronToHuman(s.cronExpression)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {s.provider}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {s.targetUsers.length > 0
                        ? `${s.targetUsers.length} user${s.targetUsers.length !== 1 ? "s" : ""}`
                        : "All users"}
                    </span>
                  </div>
                  <div className="mt-1 ml-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/20">
                    {s.nextRunAt && (
                      <span>Next run: {formatDate(s.nextRunAt)}</span>
                    )}
                    {s.lastRunAt && (
                      <span>Last run: {formatDate(s.lastRunAt)}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => handleToggleActive(s)}
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      s.isActive
                        ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                        : "bg-white/5 text-white/40 hover:bg-white/10"
                    }`}
                  >
                    {s.isActive ? "Active" : "Paused"}
                  </button>
                  <button
                    onClick={() => populateFormForEdit(s)}
                    className="rounded-md p-1 text-white/30 transition-colors hover:bg-white/10 hover:text-white/60"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {confirmDeleteId === s.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="rounded-md bg-red-500/20 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/30"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md p-1 text-white/30 hover:text-white/60"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(s.id)}
                      className="rounded-md p-1 text-red-400/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="mb-3 text-xs font-medium text-white/60">
            {editingId ? "Edit Schedule" : "New Schedule"}
          </h3>

          {/* Title */}
          <div className="mb-3">
            <label className="mb-1 block text-xs text-white/50">Title</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Weekly proposal review reminder"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div className="mb-3">
            <label className="mb-1 block text-xs text-white/50">
              Description (optional)
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Reminds students to submit their proposals"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none"
            />
          </div>

          {/* Frequency */}
          <div className="mb-3">
            <label className="mb-1 block text-xs text-white/50">Frequency</label>
            <div className="flex flex-wrap gap-2">
              {(["daily", "weekly", "monthly"] as Frequency[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormFrequency(f)}
                  className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                    formFrequency === f
                      ? "bg-blue-600 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Weekly day picker */}
          {formFrequency === "weekly" && (
            <div className="mb-3">
              <label className="mb-1 block text-xs text-white/50">Day of week</label>
              <select
                value={formWeekDay}
                onChange={(e) => setFormWeekDay(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value} className="bg-slate-900">
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Monthly day picker */}
          {formFrequency === "monthly" && (
            <div className="mb-3">
              <label className="mb-1 block text-xs text-white/50">
                Day of month (1-28)
              </label>
              <select
                value={formMonthDay}
                onChange={(e) => setFormMonthDay(Number(e.target.value))}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
              >
                {MONTH_DAYS.map((d) => (
                  <option key={d} value={d} className="bg-slate-900">
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Provider */}
          <div className="mb-3">
            <label className="mb-1 block text-xs text-white/50">Provider</label>
            <div className="flex gap-2">
              {["azure", "ollama"].map((p) => (
                <button
                  key={p}
                  onClick={() => setFormProvider(p)}
                  className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                    formProvider === p
                      ? "bg-blue-600 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Target users */}
          <div className="mb-4">
            <label className="mb-1 block text-xs text-white/50">
              Target users (comma-separated IDs, leave empty for all)
            </label>
            <input
              type="text"
              value={formTargetUsers}
              onChange={(e) => setFormTargetUsers(e.target.value)}
              placeholder="All users"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              {editingId ? "Save Changes" : "Create"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-md px-3 py-1.5 text-xs text-white/40 transition-colors hover:text-white/60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-white/10 px-3 py-1.5 text-xs text-white/40 transition-colors hover:border-white/20 hover:text-white/60"
        >
          <Plus className="h-3 w-3" />
          Add Schedule
        </button>
      )}
    </div>
  );
}
