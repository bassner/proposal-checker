"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  History,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolutionStatus = "open" | "addressing" | "resolved" | "dismissed";

export interface ResolutionHistoryEntry {
  id: string;
  reviewId: string;
  findingIndex: number;
  status: ResolutionStatus;
  changedBy: string;
  changedByName: string | null;
  comment: string | null;
  createdAt: string;
}

export interface FindingResolutionData {
  status: ResolutionStatus;
  history: ResolutionHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

interface StatusMeta {
  label: string;
  bgClass: string;
  textClass: string;
  icon: typeof Circle;
}

const STATUS_META: Record<ResolutionStatus, StatusMeta> = {
  open: {
    label: "Open",
    bgClass: "bg-slate-500/15",
    textClass: "text-slate-500 dark:text-slate-400",
    icon: Circle,
  },
  addressing: {
    label: "Addressing",
    bgClass: "bg-amber-500/15",
    textClass: "text-amber-600 dark:text-amber-400",
    icon: Loader2,
  },
  resolved: {
    label: "Resolved",
    bgClass: "bg-green-500/15",
    textClass: "text-green-600 dark:text-green-400",
    icon: CheckCircle2,
  },
  dismissed: {
    label: "Dismissed",
    bgClass: "bg-red-500/15",
    textClass: "text-red-600 dark:text-red-400",
    icon: XCircle,
  },
};

const ALL_STATUSES: ResolutionStatus[] = ["open", "addressing", "resolved", "dismissed"];

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

interface FindingResolutionProps {
  reviewId: string;
  findingIndex: number;
  resolution?: FindingResolutionData;
  onStatusChange?: (findingIndex: number, newStatus: ResolutionStatus) => void;
}

export function FindingResolution({
  reviewId,
  findingIndex,
  resolution,
  onStatusChange,
}: FindingResolutionProps) {
  const currentStatus: ResolutionStatus = resolution?.status ?? "open";
  const history = resolution?.history ?? [];

  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [pendingStatus, setPendingStatus] = useState<ResolutionStatus | null>(null);
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

  const handleTransition = useCallback(
    async (status: ResolutionStatus) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/review/${reviewId}/resolutions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            findingIndex,
            status,
            comment: commentText.trim() || undefined,
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

  const meta = STATUS_META[currentStatus];
  const StatusIcon = meta.icon;
  const otherStatuses = ALL_STATUSES.filter((s) => s !== currentStatus);

  return (
    <div className="no-print relative inline-block" ref={dropdownRef}>
      {/* Badge button */}
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
          meta.bgClass,
          meta.textClass,
          "cursor-pointer hover:opacity-80"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <StatusIcon className="h-3 w-3" />
        {meta.label}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 z-50 mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {error && (
            <div className="mb-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-red-500 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {error}
            </div>
          )}

          {/* Status options */}
          {otherStatuses.map((status) => {
            const targetMeta = STATUS_META[status];
            const TargetIcon = targetMeta.icon;
            const isSelected = pendingStatus === status;

            if (isSelected) {
              return (
                <div key={status} className="rounded px-2 py-1.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <TargetIcon className={cn("h-3.5 w-3.5", targetMeta.textClass)} />
                    <span className={cn("text-xs font-medium", targetMeta.textClass)}>
                      {targetMeta.label}
                    </span>
                  </div>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment (optional)..."
                    rows={2}
                    className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:placeholder:text-white/20 dark:focus:border-blue-500/40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleTransition(status);
                      }
                    }}
                  />
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleTransition(status)}
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
              );
            }

            return (
              <button
                key={status}
                type="button"
                onClick={() => setPendingStatus(status)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <TargetIcon className={cn("h-3.5 w-3.5", targetMeta.textClass)} />
                <span className="text-xs text-slate-700 dark:text-white/70">
                  {targetMeta.label}
                </span>
              </button>
            );
          })}

          {/* History toggle */}
          {history.length > 0 && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-white/5" />
              <button
                type="button"
                onClick={() => setHistoryOpen((h) => !h)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <History className="h-3.5 w-3.5 text-slate-400 dark:text-white/30" />
                <span className="text-xs text-slate-500 dark:text-white/50">
                  History ({history.length})
                </span>
                <ChevronDown
                  className={cn(
                    "ml-auto h-3 w-3 text-slate-400 transition-transform dark:text-white/30",
                    historyOpen && "rotate-180"
                  )}
                />
              </button>

              {historyOpen && (
                <div className="max-h-48 overflow-y-auto px-2 py-1 space-y-1.5">
                  {[...history].reverse().map((entry) => {
                    const entryMeta = STATUS_META[entry.status];
                    const EntryIcon = entryMeta.icon;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-1.5 text-[10px] text-slate-500 dark:text-white/40"
                      >
                        <EntryIcon className={cn("mt-0.5 h-3 w-3 shrink-0", entryMeta.textClass)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1">
                            <span className="font-medium text-slate-600 dark:text-white/60 truncate">
                              {entry.changedByName || "Unknown"}
                            </span>
                            <span className="flex items-center gap-0.5 text-slate-400 dark:text-white/25">
                              <Clock className="h-2.5 w-2.5" />
                              {formatRelativeTime(entry.createdAt)}
                            </span>
                          </div>
                          <span className={cn("font-medium", entryMeta.textClass)}>
                            {entryMeta.label}
                          </span>
                          {entry.comment && (
                            <p className="mt-0.5 text-slate-500 dark:text-white/35 italic">
                              {entry.comment}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only resolution badge (no dropdown). Useful for list/summary views.
 */
export function ResolutionStatusLabel({ status }: { status: ResolutionStatus }) {
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
