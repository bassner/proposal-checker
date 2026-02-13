"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  WORKFLOW_STATUS_META,
  WORKFLOW_TRANSITIONS,
} from "@/types/review";
import type { WorkflowStatus } from "@/types/review";
import type { AppRole } from "@/lib/auth/roles";
import { ChevronDown, Check, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Role-based transition filtering
// ---------------------------------------------------------------------------

const STUDENT_TRANSITIONS: Array<[WorkflowStatus, WorkflowStatus]> = [
  ["draft", "submitted"],
  ["needs_revision", "submitted"],
];

const SUPERVISOR_TRANSITIONS: Array<[WorkflowStatus, WorkflowStatus]> = [
  ["submitted", "under_review"],
  ["under_review", "approved"],
  ["under_review", "needs_revision"],
];

function getAllowedTransitions(
  current: WorkflowStatus,
  role: AppRole,
  isOwner: boolean
): WorkflowStatus[] {
  const validTargets = WORKFLOW_TRANSITIONS[current];
  if (!validTargets || validTargets.length === 0) return [];

  const isSupervisor = role === "admin" || role === "phd";

  return validTargets.filter((target) => {
    if (isSupervisor) {
      const supervisorAllowed = SUPERVISOR_TRANSITIONS.some(
        ([f, t]) => f === current && t === target
      );
      if (supervisorAllowed) return true;
    }

    if (isOwner || isSupervisor) {
      const studentAllowed = STUDENT_TRANSITIONS.some(
        ([f, t]) => f === current && t === target
      );
      if (studentAllowed) return true;
    }

    return false;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WorkflowStatusBadgeProps {
  reviewId: string;
  status: WorkflowStatus;
  role: AppRole;
  isOwner: boolean;
  onStatusChange?: (newStatus: WorkflowStatus) => void;
}

export function WorkflowStatusBadge({
  reviewId,
  status,
  role,
  isOwner,
  onStatusChange,
}: WorkflowStatusBadgeProps) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync with prop changes
  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(null);
        setError(null);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const allowedTransitions = getAllowedTransitions(currentStatus, role, isOwner);
  const meta = WORKFLOW_STATUS_META[currentStatus];
  const hasTransitions = allowedTransitions.length > 0;

  const handleTransition = useCallback(
    async (target: WorkflowStatus) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/review/${reviewId}/workflow`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: target }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Transition failed");
          setConfirming(null);
          setLoading(false);
          return;
        }

        const data = await res.json();
        setCurrentStatus(data.workflowStatus);
        onStatusChange?.(data.workflowStatus);
        setConfirming(null);
        setOpen(false);
        setError(null);
      } catch {
        setError("Network error");
        setConfirming(null);
      } finally {
        setLoading(false);
      }
    },
    [reviewId, onStatusChange]
  );

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Badge */}
      <button
        type="button"
        onClick={() => {
          if (hasTransitions) {
            setOpen((o) => !o);
            setConfirming(null);
            setError(null);
          }
        }}
        disabled={!hasTransitions}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${meta.bgClass} ${meta.textClass} ${hasTransitions ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
        aria-haspopup={hasTransitions ? "listbox" : undefined}
        aria-expanded={open}
      >
        {meta.label}
        {hasTransitions && <ChevronDown className="h-3 w-3" />}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 z-50 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {error && (
            <div className="mb-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-red-500 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {error}
            </div>
          )}

          {allowedTransitions.map((target) => {
            const targetMeta = WORKFLOW_STATUS_META[target];
            const isConfirming = confirming === target;

            if (isConfirming) {
              return (
                <div
                  key={target}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                >
                  <span className="text-xs text-slate-600 dark:text-white/60">
                    Change to {targetMeta.label}?
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleTransition(target)}
                      className="rounded bg-blue-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      {loading ? "..." : "Confirm"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setConfirming(null)}
                      className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={target}
                type="button"
                onClick={() => setConfirming(target)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${targetMeta.bgClass}`}
                  style={{ opacity: 1 }}
                />
                <span className="text-slate-700 dark:text-white/70">
                  {targetMeta.label}
                </span>
                {currentStatus === target && (
                  <Check className="ml-auto h-3 w-3 text-green-500" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only workflow status badge (no dropdown, no interactivity).
 * Useful for list views where transitions are not needed inline.
 */
export function WorkflowStatusLabel({ status }: { status: WorkflowStatus }) {
  const meta = WORKFLOW_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.bgClass} ${meta.textClass}`}
    >
      {meta.label}
    </span>
  );
}
