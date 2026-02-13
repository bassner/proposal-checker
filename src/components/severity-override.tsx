"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  AlertTriangle,
  History,
  Clock,
  ArrowRight,
  Pencil,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = "critical" | "major" | "minor" | "suggestion";

export interface SeverityOverrideEntry {
  id: string;
  reviewId: string;
  findingIndex: number;
  originalSeverity: string;
  newSeverity: string;
  reason: string | null;
  changedBy: string;
  changedByName: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Severity metadata
// ---------------------------------------------------------------------------

interface SeverityMeta {
  label: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
}

const SEVERITY_META: Record<Severity, SeverityMeta> = {
  critical: {
    label: "Critical",
    bgClass: "bg-red-500/15",
    textClass: "text-red-500 dark:text-red-400",
    dotClass: "bg-red-500",
  },
  major: {
    label: "Major",
    bgClass: "bg-orange-500/15",
    textClass: "text-orange-500 dark:text-orange-400",
    dotClass: "bg-orange-500",
  },
  minor: {
    label: "Minor",
    bgClass: "bg-yellow-500/15",
    textClass: "text-yellow-600 dark:text-yellow-400",
    dotClass: "bg-yellow-500",
  },
  suggestion: {
    label: "Suggestion",
    bgClass: "bg-blue-500/15",
    textClass: "text-blue-500 dark:text-blue-400",
    dotClass: "bg-blue-500",
  },
};

const ALL_SEVERITIES: Severity[] = ["critical", "major", "minor", "suggestion"];

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

interface SeverityOverrideProps {
  reviewId: string;
  findingIndex: number;
  /** The AI-assigned (original) severity */
  currentSeverity: Severity;
  /** Previous overrides for this finding, if any */
  overrides?: SeverityOverrideEntry[];
  /** Called after a successful override so the parent can refresh */
  onOverride?: (findingIndex: number, newSeverity: Severity) => void;
}

export function SeverityOverride({
  reviewId,
  findingIndex,
  currentSeverity,
  overrides = [],
  onOverride,
}: SeverityOverrideProps) {
  // The effective severity is the last override's newSeverity, or the AI original
  const effectiveSeverity =
    overrides.length > 0
      ? (overrides[overrides.length - 1].newSeverity as Severity)
      : currentSeverity;
  const isOverridden = overrides.length > 0;

  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [pendingSeverity, setPendingSeverity] = useState<Severity | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingSeverity(null);
        setReasonText("");
        setError(null);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleOverride = useCallback(
    async (newSeverity: Severity) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/review/${reviewId}/severity-override`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            findingIndex,
            originalSeverity: effectiveSeverity,
            newSeverity,
            reason: reasonText.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to override");
          setLoading(false);
          return;
        }

        onOverride?.(findingIndex, newSeverity);
        setOpen(false);
        setPendingSeverity(null);
        setReasonText("");
        setError(null);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    },
    [reviewId, findingIndex, effectiveSeverity, reasonText, onOverride]
  );

  const effectiveMeta = SEVERITY_META[effectiveSeverity];
  const originalMeta = SEVERITY_META[currentSeverity];
  const otherSeverities = ALL_SEVERITIES.filter((s) => s !== effectiveSeverity);

  return (
    <div className="no-print relative inline-flex items-center gap-1" ref={dropdownRef}>
      {/* Show original severity with strikethrough if overridden */}
      {isOverridden && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium line-through opacity-50",
            originalMeta.bgClass,
            originalMeta.textClass
          )}
          title={`AI-assigned: ${originalMeta.label}`}
        >
          {originalMeta.label}
        </span>
      )}

      {/* Effective severity badge + edit button */}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          effectiveMeta.bgClass,
          effectiveMeta.textClass,
          isOverridden && "ring-1 ring-current/20"
        )}
      >
        <span
          className={cn("h-1.5 w-1.5 rounded-full", effectiveMeta.dotClass)}
        />
        {effectiveMeta.label}
        {isOverridden && (
          <span className="text-[9px] opacity-60">(override)</span>
        )}
      </span>

      {/* Edit button */}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setPendingSeverity(null);
          setReasonText("");
          setError(null);
        }}
        className="inline-flex items-center justify-center rounded p-0.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-300 dark:text-white/30 dark:hover:text-white/60"
        title="Override severity"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Pencil className="h-3 w-3" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[240px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          <div className="px-2 py-1 text-[10px] font-medium text-slate-400 dark:text-white/30">
            Override severity
          </div>

          {error && (
            <div className="mb-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-red-500 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {error}
            </div>
          )}

          {/* Severity options */}
          {otherSeverities.map((severity) => {
            const targetMeta = SEVERITY_META[severity];
            const isSelected = pendingSeverity === severity;

            if (isSelected) {
              return (
                <div key={severity} className="rounded px-2 py-1.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        targetMeta.dotClass
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs font-medium",
                        targetMeta.textClass
                      )}
                    >
                      {targetMeta.label}
                    </span>
                  </div>
                  <textarea
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="Reason for override (optional)..."
                    rows={2}
                    className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:placeholder:text-white/20 dark:focus:border-blue-500/40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleOverride(severity);
                      }
                    }}
                  />
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleOverride(severity)}
                      className="rounded bg-blue-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      {loading ? "..." : "Confirm"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setPendingSeverity(null);
                        setReasonText("");
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
                key={severity}
                type="button"
                onClick={() => setPendingSeverity(severity)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    targetMeta.dotClass
                  )}
                />
                <span
                  className={cn(
                    "text-xs text-slate-700 dark:text-white/70"
                  )}
                >
                  {targetMeta.label}
                </span>
              </button>
            );
          })}

          {/* History section */}
          {overrides.length > 0 && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-white/5" />
              <button
                type="button"
                onClick={() => setHistoryOpen((h) => !h)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <History className="h-3.5 w-3.5 text-slate-400 dark:text-white/30" />
                <span className="text-xs text-slate-500 dark:text-white/50">
                  History ({overrides.length})
                </span>
                <ChevronDown
                  className={cn(
                    "ml-auto h-3 w-3 text-slate-400 transition-transform dark:text-white/30",
                    historyOpen && "rotate-180"
                  )}
                />
              </button>

              {historyOpen && (
                <div className="max-h-48 overflow-y-auto px-2 py-1 space-y-2">
                  {[...overrides].reverse().map((entry) => {
                    const fromMeta =
                      SEVERITY_META[entry.originalSeverity as Severity] ??
                      SEVERITY_META.suggestion;
                    const toMeta =
                      SEVERITY_META[entry.newSeverity as Severity] ??
                      SEVERITY_META.suggestion;
                    return (
                      <div
                        key={entry.id}
                        className="text-[10px] text-slate-500 dark:text-white/40"
                      >
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-slate-600 dark:text-white/60 truncate">
                            {entry.changedByName || "Unknown"}
                          </span>
                          <span className="flex items-center gap-0.5 text-slate-400 dark:text-white/25">
                            <Clock className="h-2.5 w-2.5" />
                            {formatRelativeTime(entry.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={cn("font-medium", fromMeta.textClass)}>
                            {fromMeta.label}
                          </span>
                          <ArrowRight className="h-2.5 w-2.5 text-slate-400 dark:text-white/25" />
                          <span className={cn("font-medium", toMeta.textClass)}>
                            {toMeta.label}
                          </span>
                        </div>
                        {entry.reason && (
                          <p className="mt-0.5 text-slate-500 dark:text-white/35 italic">
                            {entry.reason}
                          </p>
                        )}
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
 * Read-only severity badge with override indicator. No dropdown.
 * Useful for list/summary views.
 */
export function SeverityBadge({
  severity,
  isOverridden,
  originalSeverity,
}: {
  severity: Severity;
  isOverridden?: boolean;
  originalSeverity?: Severity;
}) {
  const meta = SEVERITY_META[severity];
  const originalMeta = originalSeverity
    ? SEVERITY_META[originalSeverity]
    : null;

  return (
    <span className="inline-flex items-center gap-1">
      {isOverridden && originalMeta && (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium line-through opacity-50",
            originalMeta.bgClass,
            originalMeta.textClass
          )}
        >
          {originalMeta.label}
        </span>
      )}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          meta.bgClass,
          meta.textClass,
          isOverridden && "ring-1 ring-current/20"
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)} />
        {meta.label}
      </span>
    </span>
  );
}
