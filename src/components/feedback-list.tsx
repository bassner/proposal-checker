"use client";

import type { MergedFeedback, Severity, Finding, Annotations, AnnotationStatus } from "@/types/review";
import { FeedbackCard } from "./feedback-card";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, AlertOctagon, AlertCircle, Lightbulb } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FeedbackListProps {
  feedback: MergedFeedback;
  annotations?: Annotations;
  onAnnotate?: (findingIndex: number, status: AnnotationStatus) => void;
  /** Global finding index currently focused by keyboard navigation (or null/undefined). */
  focusedGlobalIndex?: number | null;
  /** Current 1-based position in the navigation order (for screen reader announcement). */
  focusedPosition?: number | null;
  onAddComment?: (findingIndex: number, text: string) => Promise<void>;
  onDeleteComment?: (findingIndex: number, commentId: string) => Promise<void>;
  commentSubmitting?: boolean;
}

const assessmentConfig = {
  good: {
    icon: CheckCircle2,
    label: "Ready to Submit",
    gradient: "from-emerald-500/20 to-emerald-600/5",
    border: "border-emerald-500/30",
    iconColor: "text-emerald-400",
    textColor: "text-emerald-300",
  },
  acceptable: {
    icon: AlertTriangle,
    label: "Needs Minor Revisions",
    gradient: "from-amber-500/20 to-amber-600/5",
    border: "border-amber-500/30",
    iconColor: "text-amber-400",
    textColor: "text-amber-300",
  },
  "needs-work": {
    icon: XCircle,
    label: "Significant Issues",
    gradient: "from-red-500/20 to-red-600/5",
    border: "border-red-500/30",
    iconColor: "text-red-400",
    textColor: "text-red-300",
  },
};

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "suggestion"];

/** Responsive grid classes keyed by number of visible severity columns.
 *  On mobile all columns stack; at lg+ layout matches the original N-column grid exactly. */
const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
};

const severityColumnConfig: Record<
  Severity,
  { label: string; icon: LucideIcon; headerBg: string; headerText: string; countColor: string }
> = {
  critical: {
    label: "Critical",
    icon: AlertOctagon,
    headerBg: "bg-red-500/15",
    headerText: "text-red-300",
    countColor: "text-red-400",
  },
  major: {
    label: "Major",
    icon: AlertTriangle,
    headerBg: "bg-orange-500/15",
    headerText: "text-orange-300",
    countColor: "text-orange-400",
  },
  minor: {
    label: "Minor",
    icon: AlertCircle,
    headerBg: "bg-yellow-500/15",
    headerText: "text-yellow-300",
    countColor: "text-yellow-400",
  },
  suggestion: {
    label: "Suggestions",
    icon: Lightbulb,
    headerBg: "bg-blue-500/15",
    headerText: "text-blue-300",
    countColor: "text-blue-400",
  },
};

/** Finding with its original index in the feedback.findings array. */
interface IndexedFinding {
  finding: Finding;
  globalIndex: number;
}

/** Earliest page number referenced by a finding's locations, or Infinity if none. Used as sort key. */
function minPage(f: Finding): number {
  const pages = f.locations.map((l) => l.page).filter((p): p is number => p != null);
  return pages.length > 0 ? Math.min(...pages) : Infinity;
}

/** Group findings by severity, preserving their global index for annotation keys. */
function groupBySeverity(findings: Finding[]): Partial<Record<Severity, IndexedFinding[]>> {
  const groups: Partial<Record<Severity, IndexedFinding[]>> = {};
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    if (!groups[f.severity]) groups[f.severity] = [];
    groups[f.severity]!.push({ finding: f, globalIndex: i });
  }
  for (const arr of Object.values(groups)) {
    arr?.sort((a, b) => minPage(a.finding) - minPage(b.finding));
  }
  return groups;
}

export function FeedbackList({ feedback, annotations, onAnnotate, focusedGlobalIndex, focusedPosition, onAddComment, onDeleteComment, commentSubmitting }: FeedbackListProps) {
  const config = assessmentConfig[feedback.overallAssessment];
  const Icon = config.icon;
  const grouped = groupBySeverity(feedback.findings);
  const presentSeverities = SEVERITY_ORDER.filter((s) => grouped[s] && grouped[s]!.length > 0);

  // Annotation summary counts — only count entries that have a status set
  const totalFindings = feedback.findings.length;
  const addressedCount = annotations
    ? Object.values(annotations).filter((e) => e.status).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Overall assessment banner */}
      <div
        role="banner"
        aria-label={`Assessment: ${config.label}`}
        className={cn(
          "rounded-xl border bg-gradient-to-r p-4 backdrop-blur-sm",
          config.gradient,
          config.border
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className={cn("h-6 w-6 shrink-0", config.iconColor)} />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className={cn("text-sm font-semibold", config.textColor)}>
                {config.label}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/40">
                {SEVERITY_ORDER.map((s) => {
                  const count = grouped[s]?.length || 0;
                  if (count === 0) return null;
                  const col = severityColumnConfig[s];
                  const SevIcon = col.icon;
                  return (
                    <span key={s} className={cn("inline-flex items-center gap-1", col.countColor)}>
                      <SevIcon className="h-3 w-3" aria-hidden="true" />
                      {count} {col.label.toLowerCase()}
                    </span>
                  );
                })}
              </div>
              {totalFindings > 0 && addressedCount > 0 && (
                <span className="text-xs text-white/30">
                  {addressedCount}/{totalFindings} findings addressed
                </span>
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              {feedback.summary}
            </p>
          </div>
        </div>
      </div>

      {/* Partial results warning banner */}
      {feedback.failedGroups && feedback.failedGroups.length > 0 && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
            <div>
              <p className="text-sm font-medium text-orange-300">
                Partial Results
              </p>
              <p className="mt-1 text-sm text-orange-300/60">
                {feedback.failedGroups.length === 1
                  ? "1 check group failed during the review. Results below may be incomplete."
                  : `${feedback.failedGroups.length} check groups failed during the review. Results below may be incomplete.`}
              </p>
              <ul className="mt-2 space-y-1">
                {feedback.failedGroups.map((g) => (
                  <li key={g.groupId} className="text-xs text-orange-300/50">
                    <span className="font-medium text-orange-300/70">{g.label}</span>
                    {" — "}
                    {g.error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {feedback.findings.length === 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center backdrop-blur-sm">
          <p className="text-sm text-emerald-300/80">
            No issues found. The proposal meets all checked criteria.
          </p>
        </div>
      )}

      {/* Severity columns */}
      <div
        className={cn("print-single-col grid gap-4", GRID_COLS[presentSeverities.length] ?? "grid-cols-1")}
      >
        {presentSeverities.map((severity) => {
          const items = grouped[severity]!;
          const col = severityColumnConfig[severity];
          const ColIcon = col.icon;
          return (
            <div key={severity} className="min-w-0">
              {/* Column header */}
              <div
                className={cn(
                  "mb-3 flex items-center justify-between rounded-lg px-3 py-2",
                  col.headerBg
                )}
                role="heading"
                aria-level={3}
                aria-label={`${col.label}: ${items.length} finding${items.length === 1 ? "" : "s"}`}
              >
                <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider", col.headerText)}>
                  <ColIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {col.label}
                </span>
                <span className={cn("text-xs font-bold", col.countColor)}>
                  {items.length}
                </span>
              </div>
              {/* Cards */}
              <div className="space-y-2">
                {items.map(({ finding, globalIndex }) => (
                  <FeedbackCard
                    key={`${finding.severity}-${globalIndex}`}
                    finding={finding}
                    annotation={annotations?.[String(globalIndex)]}
                    onAnnotate={onAnnotate ? (status) => onAnnotate(globalIndex, status) : undefined}
                    focused={focusedGlobalIndex === globalIndex}
                    onAddComment={onAddComment ? (text) => onAddComment(globalIndex, text) : undefined}
                    onDeleteComment={onDeleteComment ? (commentId) => onDeleteComment(globalIndex, commentId) : undefined}
                    commentSubmitting={commentSubmitting}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Screen reader announcement for keyboard navigation */}
      {focusedPosition != null && (
        <div role="status" aria-live="polite" className="sr-only">
          Finding {focusedPosition} of {totalFindings}
        </div>
      )}

      {/* Keyboard navigation hint */}
      {onAnnotate && totalFindings > 0 && (
        <p className="no-print text-center text-[11px] text-white/20">
          <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[10px]">j</kbd>
          {" / "}
          <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[10px]">k</kbd>
          {" navigate "}
          <span className="mx-1">&middot;</span>
          <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[10px]">Enter</kbd>
          {" accept "}
          <span className="mx-1">&middot;</span>
          <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[10px]">Esc</kbd>
          {" deselect"}
        </p>
      )}
    </div>
  );
}
