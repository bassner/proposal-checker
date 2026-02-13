"use client";

import { AlertTriangle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { AnnotationConflict } from "@/types/review";

const STATUS_LABELS: Record<string, string> = {
  accepted: "Accepted",
  dismissed: "Dismissed",
  fixed: "Fixed",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

interface ConflictIndicatorProps {
  conflict: AnnotationConflict;
}

export function ConflictIndicator({ conflict }: ConflictIndicatorProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="no-print inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:hover:bg-amber-500/25"
          aria-label="Annotation conflict detected"
        >
          <AlertTriangle className="h-2.5 w-2.5" />
          Conflict
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-64 border-amber-500/20 bg-white p-3 dark:border-amber-500/20 dark:bg-slate-900"
      >
        <p className="mb-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          Conflicting Annotations
        </p>
        <p className="mb-2 text-[10px] text-slate-500 dark:text-white/40">
          Different reviewers set different statuses on this finding.
        </p>
        <div className="space-y-1.5">
          {conflict.entries.map((entry) => (
            <div
              key={entry.userId}
              className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 dark:bg-white/[0.03]"
            >
              <div className="min-w-0">
                <p className="truncate text-[10px] font-medium text-slate-700 dark:text-white/70">
                  {entry.userName ?? "Unknown"}
                </p>
                <p className="text-[9px] text-slate-400 dark:text-white/25">
                  {formatDate(entry.createdAt)}
                </p>
              </div>
              <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-white/10 dark:text-white/50">
                {STATUS_LABELS[entry.status] ?? entry.status}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
