"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Info,
  ChevronDown,
  RefreshCw,
  ArrowRight,
  FileSearch,
} from "lucide-react";
import type { PreflightWarning } from "@/lib/pdf/preflight";

interface PreflightWarningsProps {
  warnings: PreflightWarning[];
  pageCount: number;
  onReviewAnyway: () => void;
  onReUpload: () => void;
  disabled?: boolean;
}

/**
 * Collapsible panel that displays preflight PDF analysis warnings.
 * Shown after file upload but before review submission.
 */
export function PreflightWarnings({
  warnings,
  pageCount,
  onReviewAnyway,
  onReUpload,
  disabled,
}: PreflightWarningsProps) {
  const [expanded, setExpanded] = useState(true);

  const warningCount = warnings.filter((w) => w.severity === "warning").length;
  const infoCount = warnings.filter((w) => w.severity === "info").length;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2.5">
          <FileSearch className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Preflight Analysis
          </span>
          <span className="text-xs text-amber-600/70 dark:text-amber-400/60">
            {pageCount} page{pageCount !== 1 ? "s" : ""} detected
          </span>
          {warningCount > 0 && (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
              {warningCount} warning{warningCount !== 1 ? "s" : ""}
            </span>
          )}
          {infoCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
              {infoCount} note{infoCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-amber-500 transition-transform duration-200 dark:text-amber-400/60 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Warning list */}
      {expanded && (
        <div className="border-t border-amber-200 px-4 pb-4 pt-3 dark:border-amber-500/20">
          <ul className="space-y-2.5">
            {warnings.map((w) => (
              <li key={w.id} className="flex gap-2.5">
                {w.severity === "warning" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white/80">
                    {w.message}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-white/40">
                    {w.suggestion}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Action buttons */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onReUpload}
              disabled={disabled}
              className="flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-40 dark:border-amber-500/30 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-500/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Fix & Re-upload
            </button>
            <button
              type="button"
              onClick={onReviewAnyway}
              disabled={disabled}
              className="flex items-center justify-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-40 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
            >
              Review Anyway
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
