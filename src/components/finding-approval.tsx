"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Clock,
  MessageSquare,
  User,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FindingApprovalStatus = "approved" | "disputed" | "needs_action";

export interface FindingApprovalData {
  id: string;
  reviewId: string;
  findingIndex: number;
  status: FindingApprovalStatus;
  advisorComment: string | null;
  approvedBy: string;
  approvedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

interface StatusMeta {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  icon: typeof Check;
}

const STATUS_META: Record<FindingApprovalStatus, StatusMeta> = {
  approved: {
    label: "Approved",
    bgClass: "bg-green-500/15",
    textClass: "text-green-600 dark:text-green-400",
    borderClass: "border-green-500/30",
    icon: Check,
  },
  disputed: {
    label: "Disputed",
    bgClass: "bg-red-500/15",
    textClass: "text-red-600 dark:text-red-400",
    borderClass: "border-red-500/30",
    icon: X,
  },
  needs_action: {
    label: "Needs Action",
    bgClass: "bg-amber-500/15",
    textClass: "text-amber-600 dark:text-amber-400",
    borderClass: "border-amber-500/30",
    icon: AlertTriangle,
  },
};

const ALL_STATUSES: FindingApprovalStatus[] = ["approved", "disputed", "needs_action"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FindingApprovalProps {
  reviewId: string;
  findingIndex: number;
  approval?: FindingApprovalData;
  onStatusChange?: (findingIndex: number, newStatus: FindingApprovalStatus) => void;
}

export function FindingApproval({
  reviewId,
  findingIndex,
  approval,
  onStatusChange,
}: FindingApprovalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [pendingStatus, setPendingStatus] = useState<FindingApprovalStatus | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingStatus(null);
        setCommentText("");
        setError(null);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleSubmit = useCallback(
    async (status: FindingApprovalStatus) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/review/${reviewId}/approvals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            findingIndex,
            status,
            advisorComment: commentText.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to update");
          setLoading(false);
          return;
        }

        onStatusChange?.(findingIndex, status);
        setOpen(false);
        setPendingStatus(null);
        setCommentText("");
        setError(null);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    },
    [reviewId, findingIndex, commentText, onStatusChange]
  );

  const currentStatus = approval?.status;
  const hasApproval = !!currentStatus;

  return (
    <div className="no-print relative inline-block" ref={dropdownRef}>
      {/* Current status badge / trigger button */}
      {hasApproval ? (
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setPendingStatus(null);
            setCommentText("");
            setError(null);
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
            STATUS_META[currentStatus].bgClass,
            STATUS_META[currentStatus].textClass,
            "cursor-pointer hover:opacity-80"
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {(() => {
            const Icon = STATUS_META[currentStatus].icon;
            return <Icon className="h-3 w-3" />;
          })()}
          {STATUS_META[currentStatus].label}
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setPendingStatus(null);
            setCommentText("");
            setError(null);
          }}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[10px] font-medium text-white/40 transition-colors hover:border-white/40 hover:text-white/60 cursor-pointer"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <Check className="h-3 w-3" />
          Review
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 z-50 mt-1 min-w-[260px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {error && (
            <div className="mb-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-red-500 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {error}
            </div>
          )}

          {/* Quick action buttons */}
          {!pendingStatus && (
            <div className="px-1 pb-1">
              <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-white/30">
                Set approval
              </div>
              <div className="flex gap-1">
                {ALL_STATUSES.map((status) => {
                  const meta = STATUS_META[status];
                  const Icon = meta.icon;
                  const isActive = currentStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        if (status === "disputed") {
                          // Disputes require a comment
                          setPendingStatus(status);
                        } else {
                          handleSubmit(status);
                        }
                      }}
                      disabled={loading}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-2 text-xs transition-colors",
                        isActive
                          ? cn(meta.bgClass, meta.textClass, "ring-1", meta.borderClass)
                          : "hover:bg-slate-50 text-slate-600 dark:text-white/60 dark:hover:bg-white/5",
                        loading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className={cn("h-4 w-4", isActive ? meta.textClass : "")} />
                      )}
                      <span className="text-[10px] font-medium">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Comment input for disputes (or optional for other statuses) */}
          {pendingStatus && (
            <div className="rounded px-2 py-1.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                {(() => {
                  const Icon = STATUS_META[pendingStatus].icon;
                  return (
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        STATUS_META[pendingStatus].textClass
                      )}
                    />
                  );
                })()}
                <span
                  className={cn(
                    "text-xs font-medium",
                    STATUS_META[pendingStatus].textClass
                  )}
                >
                  {STATUS_META[pendingStatus].label}
                </span>
              </div>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={
                  pendingStatus === "disputed"
                    ? "Reason for disputing (required)..."
                    : "Add a comment (optional)..."
                }
                rows={2}
                className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:placeholder:text-white/20 dark:focus:border-blue-500/40"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (pendingStatus !== "disputed" || commentText.trim()) {
                      handleSubmit(pendingStatus);
                    }
                  }
                }}
              />
              <div className="flex gap-1 justify-end">
                <button
                  type="button"
                  disabled={
                    loading ||
                    (pendingStatus === "disputed" && !commentText.trim())
                  }
                  onClick={() => handleSubmit(pendingStatus)}
                  className="rounded bg-blue-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? "..." : "Confirm"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setPendingStatus(null);
                    setCommentText("");
                  }}
                  className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Current approval info */}
          {approval && !pendingStatus && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-white/5" />
              <div className="px-2 py-1.5 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-white/40">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="font-medium text-slate-600 dark:text-white/60 truncate">
                    {approval.approvedByName || "Unknown"}
                  </span>
                  <span className="flex items-center gap-0.5 text-slate-400 dark:text-white/25">
                    <Clock className="h-2.5 w-2.5" />
                    {formatRelativeTime(approval.updatedAt)}
                  </span>
                </div>
                {approval.advisorComment && (
                  <div className="flex items-start gap-1.5 text-[10px] text-slate-500 dark:text-white/40">
                    <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                    <p className="italic text-slate-500 dark:text-white/35">
                      {approval.advisorComment}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only approval badge (no dropdown). Useful for list/summary views.
 */
export function ApprovalStatusLabel({ status }: { status: FindingApprovalStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        meta.bgClass,
        meta.textClass
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
