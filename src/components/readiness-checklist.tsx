"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Loader2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

// ---------------------------------------------------------------------------
// Default checklist items for thesis proposals
// ---------------------------------------------------------------------------

const DEFAULT_CHECKLIST_ITEMS = [
  "Has a clear problem statement",
  "Research questions are clearly stated",
  "Motivation and objectives are described",
  "Related work section is present",
  "Methodology is described",
  "Contains 10+ bibliography entries",
  "All figures have captions",
  "Schedule or timeline is included",
  "AI tool usage is disclosed (if applicable)",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckItem {
  label: string;
  checked: boolean;
}

interface ReadinessChecklistProps {
  /** File name to associate with the checklist (shown in header). */
  fileName?: string | null;
  /** Called when user clicks "Submit for Review" with all checks passed. */
  onSubmitForReview?: () => void;
  /** Whether the submit button should be disabled (e.g. during upload). */
  submitDisabled?: boolean;
  /** Label text for the submit button. */
  submitLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReadinessChecklist({
  fileName,
  onSubmitForReview,
  submitDisabled,
  submitLabel = "Submit for Review",
}: ReadinessChecklistProps) {
  const [checks, setChecks] = useState<CheckItem[]>(
    DEFAULT_CHECKLIST_ITEMS.map((label) => ({ label, checked: false }))
  );
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Debounce save: wait 500ms after last change before persisting
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const passedCount = checks.filter((c) => c.checked).length;
  const totalCount = checks.length;
  const allPassed = totalCount > 0 && passedCount === totalCount;
  const percentage = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

  // Persist checklist to backend (debounced)
  const persistChecklist = useCallback(
    async (updatedChecks: CheckItem[]) => {
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch("/api/readiness-checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: checklistId,
            fileName: fileName ?? null,
            checks: updatedChecks,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setSaveError(data?.error ?? "Failed to save checklist");
          return;
        }
        const data = await res.json();
        if (data.checklist?.id && !checklistId) {
          setChecklistId(data.checklist.id);
        }
      } catch {
        setSaveError("Network error — checklist not saved");
      } finally {
        setSaving(false);
      }
    },
    [checklistId, fileName]
  );

  const toggleCheck = useCallback(
    (index: number) => {
      setChecks((prev) => {
        const next = prev.map((item, i) =>
          i === index ? { ...item, checked: !item.checked } : item
        );

        // Schedule debounced save
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          persistChecklist(next);
        }, 500);

        return next;
      });
    },
    [persistChecklist]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="h-4.5 w-4.5 text-indigo-500 dark:text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-white/90">
            Readiness Checklist
          </h3>
          {fileName && (
            <span className="max-w-48 truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-white/5 dark:text-white/40">
              {fileName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-white/30">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving
            </span>
          )}
          <span
            className={`text-xs font-medium ${
              allPassed
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-500 dark:text-white/50"
            }`}
          >
            {passedCount}/{totalCount}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-4">
        <Progress
          value={percentage}
          className={`h-2 ${
            allPassed
              ? "[&>[data-slot=progress-indicator]]:bg-emerald-500"
              : "[&>[data-slot=progress-indicator]]:bg-indigo-500"
          }`}
        />
        <p className="mt-1.5 text-xs text-slate-400 dark:text-white/30">
          {percentage}% complete
          {allPassed && " — ready to submit"}
        </p>
      </div>

      {/* Checklist items */}
      <ul className="px-5 pb-2 pt-3">
        {checks.map((item, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => toggleCheck(index)}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
            >
              {item.checked ? (
                <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <Circle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-slate-300 dark:text-white/20" />
              )}
              <span
                className={`text-sm leading-snug ${
                  item.checked
                    ? "text-slate-400 line-through dark:text-white/30"
                    : "text-slate-700 dark:text-white/70"
                }`}
              >
                {item.label}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Error notice */}
      {saveError && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/20 dark:bg-red-500/5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
          <span className="text-xs text-red-600 dark:text-red-300">
            {saveError}
          </span>
        </div>
      )}

      {/* Footer with submit button */}
      {onSubmitForReview && (
        <div className="border-t border-slate-200 px-5 py-4 dark:border-white/10">
          <button
            type="button"
            onClick={onSubmitForReview}
            disabled={submitDisabled || !allPassed}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              allPassed && !submitDisabled
                ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                : "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-white/20"
            }`}
          >
            {allPassed ? (
              <>
                {submitLabel}
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>Complete all checks to submit</>
            )}
          </button>
          {!allPassed && (
            <p className="mt-2 text-center text-xs text-slate-400 dark:text-white/30">
              {totalCount - passedCount} item{totalCount - passedCount !== 1 ? "s" : ""}{" "}
              remaining
            </p>
          )}
        </div>
      )}
    </div>
  );
}
