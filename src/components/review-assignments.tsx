"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, Users, CheckCircle2, Trash2, ChevronDown, ChevronUp, Loader2, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Assignment {
  id: string;
  reviewId: string;
  assignedTo: string;
  assignedBy: string;
  assignedByName: string;
  status: "pending" | "in_progress" | "completed";
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    badgeBg: "bg-amber-100 dark:bg-amber-500/20",
    badgeText: "text-amber-700 dark:text-amber-400",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    badgeBg: "bg-blue-100 dark:bg-blue-500/20",
    badgeText: "text-blue-700 dark:text-blue-400",
    icon: ArrowRight,
  },
  completed: {
    label: "Completed",
    badgeBg: "bg-green-100 dark:bg-green-500/20",
    badgeText: "text-green-700 dark:text-green-400",
    icon: CheckCircle2,
  },
} as const;

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReviewAssignments({ reviewId }: { reviewId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  const isSupervisor = role === "admin" || role === "phd";

  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assign form state
  const [showForm, setShowForm] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}/assignments`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load assignments");
        return;
      }
      const data = await res.json();
      setAssignments(data.assignments ?? []);
    } catch {
      setError("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    if (open && assignments.length === 0 && !loading && !error) {
      fetchAssignments();
    }
  }, [open, assignments.length, loading, error, fetchAssignments]);

  const handleAssign = useCallback(async () => {
    if (!assignEmail.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review/${reviewId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedTo: assignEmail.trim(),
          note: assignNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to create assignment");
        return;
      }
      const data = await res.json();
      setAssignments(data.assignments ?? []);
      setAssignEmail("");
      setAssignNote("");
      setShowForm(false);
    } catch {
      setError("Failed to create assignment");
    } finally {
      setSubmitting(false);
    }
  }, [reviewId, assignEmail, assignNote]);

  const handleStatusUpdate = useCallback(
    async (assignmentId: string, newStatus: Assignment["status"]) => {
      try {
        const res = await fetch(
          `/api/review/${reviewId}/assignments/${assignmentId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        setAssignments(data.assignments ?? []);
      } catch {
        // Silently fail
      }
    },
    [reviewId]
  );

  const handleDelete = useCallback(
    async (assignmentId: string) => {
      try {
        const res = await fetch(
          `/api/review/${reviewId}/assignments/${assignmentId}`,
          { method: "DELETE" }
        );
        if (!res.ok) return;
        const data = await res.json();
        setAssignments(data.assignments ?? []);
      } catch {
        // Silently fail
      }
    },
    [reviewId]
  );

  const nextStatus = (current: Assignment["status"]): Assignment["status"] | null => {
    if (current === "pending") return "in_progress";
    if (current === "in_progress") return "completed";
    return null;
  };

  const assignmentCount = assignments.length;

  return (
    <section className="no-print mt-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-medium text-slate-600 backdrop-blur-xl transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
        aria-expanded={open}
      >
        <Users className="h-4 w-4 text-slate-400 dark:text-white/40" />
        <span className="flex-1">Review Assignments</span>
        {assignmentCount > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500 dark:bg-white/10 dark:text-white/40">
            {assignmentCount}
          </span>
        )}
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-400 dark:text-white/40" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400 dark:text-white/40" />
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white/80 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
          {loading && (
            <p className="py-4 text-center text-xs text-slate-400 dark:text-white/40">
              Loading assignments...
            </p>
          )}

          {error && (
            <p className="py-4 text-center text-xs text-red-500 dark:text-red-400">
              {error}
            </p>
          )}

          {!loading && !error && (
            <div className="space-y-3">
              {/* Assignment list */}
              {assignments.length > 0 ? (
                <div className="space-y-2">
                  {assignments.map((a) => {
                    const config = STATUS_CONFIG[a.status];
                    const StatusIcon = config.icon;
                    const isAssigner = a.assignedBy === userId;
                    const isAssignee = a.assignedTo === userEmail || a.assignedTo === userId;
                    const canDelete = isAssigner || role === "admin";
                    const canAdvance = (isAssignee || isSupervisor) && nextStatus(a.status) !== null;

                    return (
                      <div
                        key={a.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/[0.02]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium text-slate-700 dark:text-white/80">
                                {a.assignedTo}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.badgeBg} ${config.badgeText}`}
                              >
                                <StatusIcon className="h-3 w-3" />
                                {config.label}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-400 dark:text-white/30">
                              Assigned by {a.assignedByName}{" "}
                              <span title={formatFullTime(a.createdAt)}>
                                {formatTime(a.createdAt)}
                              </span>
                            </p>
                            {a.note && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
                                {a.note}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {canAdvance && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleStatusUpdate(a.id, nextStatus(a.status)!)
                                }
                                className="h-7 px-2 text-xs text-slate-500 hover:text-blue-600 dark:text-white/40 dark:hover:text-blue-400"
                                title={`Move to ${STATUS_CONFIG[nextStatus(a.status)!].label}`}
                              >
                                {nextStatus(a.status) === "in_progress"
                                  ? "Start"
                                  : "Complete"}
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(a.id)}
                                className="h-6 w-6 p-0 text-slate-400 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400"
                                aria-label={`Remove assignment for ${a.assignedTo}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-2 text-center text-xs text-slate-400 dark:text-white/40">
                  No assignments yet.
                </p>
              )}

              {/* Assign button + form (supervisors only) */}
              {isSupervisor && !showForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(true)}
                  className="w-full border-dashed border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 dark:border-white/10 dark:text-white/40 dark:hover:border-blue-500/30 dark:hover:text-blue-400"
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Assign Review
                </Button>
              )}

              {isSupervisor && showForm && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-500/20 dark:bg-blue-500/5">
                  <div className="space-y-2">
                    <div>
                      <label
                        htmlFor="assign-email"
                        className="mb-1 block text-xs font-medium text-slate-600 dark:text-white/60"
                      >
                        Assign to (email)
                      </label>
                      <input
                        id="assign-email"
                        type="email"
                        value={assignEmail}
                        onChange={(e) => setAssignEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/30 dark:focus:border-blue-500/50 dark:focus:ring-blue-500/50"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="assign-note"
                        className="mb-1 block text-xs font-medium text-slate-600 dark:text-white/60"
                      >
                        Note (optional)
                      </label>
                      <input
                        id="assign-note"
                        type="text"
                        value={assignNote}
                        onChange={(e) => setAssignNote(e.target.value)}
                        placeholder="e.g., Please review the bibliography section"
                        maxLength={2000}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/30 dark:focus:border-blue-500/50 dark:focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={handleAssign}
                        disabled={submitting || !assignEmail.trim()}
                        className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Assigning...
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                            Assign
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowForm(false);
                          setAssignEmail("");
                          setAssignNote("");
                        }}
                        className="text-slate-500 dark:text-white/40"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
