"use client";

import { useState, useMemo } from "react";
import type { MergedFeedback, Severity, Finding, Annotations, AnnotationStatus, FindingCategory } from "@/types/review";
import { FINDING_CATEGORIES, FINDING_CATEGORY_VALUES, normalizeFindingCategory } from "@/types/review";
import { FeedbackCard } from "./feedback-card";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, AlertOctagon, AlertCircle, Lightbulb, CheckCheck, Eraser, Search, XIcon, Filter } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FeedbackListProps {
  feedback: MergedFeedback;
  annotations?: Annotations;
  onAnnotate?: (findingIndex: number, status: AnnotationStatus) => void;
  onBulkAnnotate?: (indices: number[], status: AnnotationStatus) => void;
  onClearAllAnnotations?: () => void;
  /** Global finding index currently focused by keyboard navigation (or null/undefined). */
  focusedGlobalIndex?: number | null;
  /** Current 1-based position in the navigation order (for screen reader announcement). */
  focusedPosition?: number | null;
  onAddComment?: (findingIndex: number, text: string) => Promise<void>;
  onDeleteComment?: (findingIndex: number, commentId: string) => Promise<void>;
  commentSubmitting?: boolean;
  /** Called when a page reference in a finding is clicked (for PDF viewer navigation). */
  onPageClick?: (page: number) => void;
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

/** Group pre-indexed findings by severity. */
function groupIndexedBySeverity(indexed: IndexedFinding[]): Partial<Record<Severity, IndexedFinding[]>> {
  const groups: Partial<Record<Severity, IndexedFinding[]>> = {};
  for (const item of indexed) {
    const sev = item.finding.severity;
    if (!groups[sev]) groups[sev] = [];
    groups[sev]!.push(item);
  }
  for (const arr of Object.values(groups)) {
    arr?.sort((a, b) => minPage(a.finding) - minPage(b.finding));
  }
  return groups;
}

type AnnotationFilter = "all" | "unaddressed" | "accepted" | "dismissed" | "fixed";

const ANNOTATION_FILTER_OPTIONS: { value: AnnotationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unaddressed", label: "Unaddressed" },
  { value: "accepted", label: "Accepted" },
  { value: "dismissed", label: "Dismissed" },
  { value: "fixed", label: "Fixed" },
];

function FilterBar({
  severityFilter,
  onToggleSeverity,
  categoryFilter,
  onToggleCategory,
  presentCategories,
  annotationFilter,
  onAnnotationFilter,
  searchQuery,
  onSearchQuery,
  presentSeverities,
  visibleCount,
  totalCount,
}: {
  severityFilter: Set<Severity>;
  onToggleSeverity: (s: Severity) => void;
  categoryFilter: Set<FindingCategory>;
  onToggleCategory: (c: FindingCategory) => void;
  presentCategories: FindingCategory[];
  annotationFilter: AnnotationFilter;
  onAnnotationFilter: (f: AnnotationFilter) => void;
  searchQuery: string;
  onSearchQuery: (q: string) => void;
  presentSeverities: Severity[];
  visibleCount: number;
  totalCount: number;
}) {
  const isFiltering =
    severityFilter.size < 4 ||
    categoryFilter.size < FINDING_CATEGORY_VALUES.length ||
    annotationFilter !== "all" ||
    searchQuery.length > 0;

  return (
    <div className="no-print space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-3">
        {/* Severity toggles */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-slate-400 dark:text-white/30" />
          {SEVERITY_ORDER.map((s) => {
            const col = severityColumnConfig[s];
            const active = severityFilter.has(s);
            const hasFindingsOfType = presentSeverities.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onToggleSeverity(s)}
                disabled={!hasFindingsOfType}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 dark:focus-visible:ring-white/40",
                  active && hasFindingsOfType
                    ? cn(col.headerBg, col.headerText)
                    : "text-slate-400 hover:text-slate-600 dark:text-white/20 dark:hover:text-white/40",
                  !hasFindingsOfType && "opacity-30 cursor-not-allowed",
                )}
              >
                {col.label}
              </button>
            );
          })}
        </div>

        {/* Category toggles */}
        {presentCategories.length > 0 && (
          <div className="flex items-center gap-1 border-l border-slate-200 pl-3 dark:border-white/10">
            <span className="mr-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-white/25">Cat</span>
            {presentCategories.map((cat) => {
              const meta = FINDING_CATEGORIES[cat];
              const active = categoryFilter.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onToggleCategory(cat)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 dark:focus-visible:ring-white/40",
                    active
                      ? cn(meta.bgClass, meta.textClass)
                      : "text-slate-400 hover:text-slate-600 dark:text-white/20 dark:hover:text-white/40",
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Annotation status filter */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-3 dark:border-white/10">
          {ANNOTATION_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onAnnotationFilter(value)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 dark:focus-visible:ring-white/40",
                annotationFilter === value
                  ? "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-white/70"
                  : "text-slate-400 hover:text-slate-600 dark:text-white/25 dark:hover:text-white/45",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative ml-auto min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-white/25" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQuery(e.target.value)}
            placeholder="Search findings..."
            aria-label="Search findings"
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:placeholder:text-white/20 dark:focus:border-white/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter status */}
      <p className="text-[11px] text-slate-500 dark:text-white/35" aria-live="polite" role="status">
        {isFiltering
          ? `Showing ${visibleCount} of ${totalCount} finding${totalCount !== 1 ? "s" : ""}`
          : ""}
      </p>
    </div>
  );
}

export function FeedbackList({ feedback, annotations, onAnnotate, onBulkAnnotate, onClearAllAnnotations, focusedGlobalIndex, focusedPosition, onAddComment, onDeleteComment, commentSubmitting, onPageClick }: FeedbackListProps) {
  const config = assessmentConfig[feedback.overallAssessment];
  const Icon = config.icon;

  // ── Filter state ──────────────────────────────────────────────────────
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(new Set(SEVERITY_ORDER));
  const [categoryFilter, setCategoryFilter] = useState<Set<FindingCategory>>(new Set(FINDING_CATEGORY_VALUES));
  const [annotationFilter, setAnnotationFilter] = useState<AnnotationFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const handleToggleSeverity = (s: Severity) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  };

  const handleToggleCategory = (c: FindingCategory) => {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) {
        next.delete(c);
      } else {
        next.add(c);
      }
      return next;
    });
  };

  // Unfiltered grouping (for the assessment banner counts and knowing which severities exist)
  const allGrouped = groupBySeverity(feedback.findings);
  const allPresentSeverities = SEVERITY_ORDER.filter((s) => allGrouped[s] && allGrouped[s]!.length > 0);

  // Categories present in findings (for showing only relevant category filter buttons)
  const allPresentCategories: FindingCategory[] = useMemo(() => {
    const cats = new Set<FindingCategory>();
    for (const f of feedback.findings) {
      cats.add(normalizeFindingCategory(f.category));
    }
    // Return in the canonical order defined in FINDING_CATEGORY_VALUES
    return FINDING_CATEGORY_VALUES.filter((c) => cats.has(c));
  }, [feedback.findings]);

  // ── Apply filters ─────────────────────────────────────────────────────
  const searchLower = searchQuery.toLowerCase();

  const filteredIndexed: IndexedFinding[] = useMemo(() => {
    const result: IndexedFinding[] = [];
    for (let i = 0; i < feedback.findings.length; i++) {
      const f = feedback.findings[i];
      // Severity filter
      if (!severityFilter.has(f.severity)) continue;
      // Category filter
      if (categoryFilter.size < FINDING_CATEGORY_VALUES.length) {
        const cat = normalizeFindingCategory(f.category);
        if (!categoryFilter.has(cat)) continue;
      }
      // Annotation status filter
      if (annotationFilter !== "all") {
        const status = annotations?.[String(i)]?.status;
        if (annotationFilter === "unaddressed") {
          if (status) continue; // has a status → skip
        } else {
          if (status !== annotationFilter) continue;
        }
      }
      // Text search
      if (searchLower) {
        const inTitle = f.title.toLowerCase().includes(searchLower);
        const inDesc = f.description.toLowerCase().includes(searchLower);
        if (!inTitle && !inDesc) continue;
      }
      result.push({ finding: f, globalIndex: i });
    }
    return result;
  }, [feedback.findings, severityFilter, categoryFilter, annotationFilter, searchLower, annotations]);

  const filtered = groupIndexedBySeverity(filteredIndexed);
  const presentSeverities = SEVERITY_ORDER.filter((s) => filtered[s] && filtered[s]!.length > 0);

  // Annotation summary counts — only count entries that have a status set
  const totalFindings = feedback.findings.length;
  const addressedCount = annotations
    ? Object.values(annotations).filter((e) => e.status).length
    : 0;

  // Bulk action helpers
  const unaddressedIndices = totalFindings > 0
    ? feedback.findings
        .map((_, i) => i)
        .filter((i) => !annotations?.[String(i)]?.status)
    : [];
  const suggestionIndices = totalFindings > 0
    ? feedback.findings
        .map((f, i) => ({ severity: f.severity, index: i }))
        .filter((e) => e.severity === "suggestion" && !annotations?.[String(e.index)]?.status)
        .map((e) => e.index)
    : [];

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
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-white/40">
                {SEVERITY_ORDER.map((s) => {
                  const count = allGrouped[s]?.length || 0;
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
                <span className="text-xs text-slate-400 dark:text-white/30">
                  {addressedCount}/{totalFindings} findings addressed
                </span>
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-white/60">
              {feedback.summary}
            </p>
            {/* Bulk annotation actions */}
            {onBulkAnnotate && totalFindings > 0 && (
              <div className="no-print mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onBulkAnnotate(unaddressedIndices, "accepted")}
                  disabled={unaddressedIndices.length === 0}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/10 dark:bg-white/5 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/70"
                >
                  <CheckCheck className="h-3 w-3" />
                  Accept All
                </button>
                {suggestionIndices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onBulkAnnotate(suggestionIndices, "dismissed")}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/70"
                  >
                    <XIcon className="h-3 w-3" />
                    Dismiss Suggestions
                  </button>
                )}
                {addressedCount > 0 && onClearAllAnnotations && (
                  <button
                    type="button"
                    onClick={onClearAllAnnotations}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/70"
                  >
                    <Eraser className="h-3 w-3" />
                    Clear All
                  </button>
                )}
              </div>
            )}
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

      {/* Filter bar — only show when there are findings */}
      {totalFindings > 0 && (
        <FilterBar
          severityFilter={severityFilter}
          onToggleSeverity={handleToggleSeverity}
          categoryFilter={categoryFilter}
          onToggleCategory={handleToggleCategory}
          presentCategories={allPresentCategories}
          annotationFilter={annotationFilter}
          onAnnotationFilter={setAnnotationFilter}
          searchQuery={searchQuery}
          onSearchQuery={setSearchQuery}
          presentSeverities={allPresentSeverities}
          visibleCount={filteredIndexed.length}
          totalCount={totalFindings}
        />
      )}

      {/* Empty filter result */}
      {totalFindings > 0 && filteredIndexed.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
          <p className="text-sm text-slate-500 dark:text-white/40">
            No findings match the current filters.
          </p>
        </div>
      )}

      {/* Severity columns */}
      <div
        className={cn("print-single-col grid gap-4", GRID_COLS[presentSeverities.length] ?? "grid-cols-1")}
      >
        {presentSeverities.map((severity) => {
          const items = filtered[severity]!;
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
                    onPageClick={onPageClick}
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
        <p className="no-print text-center text-[11px] text-slate-400 dark:text-white/20">
          <kbd className="rounded border border-slate-200 px-1 py-0.5 font-mono text-[10px] dark:border-white/10">j</kbd>
          {" / "}
          <kbd className="rounded border border-slate-200 px-1 py-0.5 font-mono text-[10px] dark:border-white/10">k</kbd>
          {" navigate "}
          <span className="mx-1">&middot;</span>
          <kbd className="rounded border border-slate-200 px-1 py-0.5 font-mono text-[10px] dark:border-white/10">Enter</kbd>
          {" accept "}
          <span className="mx-1">&middot;</span>
          <kbd className="rounded border border-slate-200 px-1 py-0.5 font-mono text-[10px] dark:border-white/10">Esc</kbd>
          {" deselect"}
        </p>
      )}
    </div>
  );
}
