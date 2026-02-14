"use client";

import { useState, useMemo, useEffect } from "react";
import type { Finding, MergedFeedback, Severity, VersionComparison as VersionComparisonData } from "@/types/review";
import { cn } from "@/lib/utils";
import {
  GitCompareArrows,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  AlertCircle,
  Lightbulb,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VersionInfo {
  reviewId: string;
  versionNumber: number;
  createdAt: string;
  fileName: string | null;
  status: string;
  findingCount: number;
}

type ComparisonStatus = "resolved" | "persistent" | "new";

interface ComparedFinding {
  status: ComparisonStatus;
  finding: Finding;
  /** For persistent findings, the matching finding from the other version. */
  matchedFinding?: Finding;
  /** LLM-generated reasoning for why this finding was resolved. */
  reasoning?: string;
  /** True if check groups disagreed on resolution status. */
  conflicted?: boolean;
}

interface VersionComparisonProps {
  /** The current review's ID. */
  reviewId: string;
  /** All versions in the group (ordered by version number). */
  versions: VersionInfo[];
  /** Group ID (null if not part of a group). */
  groupId: string | null;
}

// ---------------------------------------------------------------------------
// Similarity matching
// ---------------------------------------------------------------------------

/**
 * Compute a simple similarity score (0-1) between two finding titles using
 * word-level Jaccard similarity, plus a bonus for exact substring match.
 */
function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const na = normalize(a);
  const nb = normalize(b);

  // Exact match
  if (na === nb) return 1.0;

  // Substring bonus
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Word-level Jaccard
  const wordsA = new Set(na.split(/\s+/).filter(Boolean));
  const wordsB = new Set(nb.split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

const SIMILARITY_THRESHOLD = 0.45;

/**
 * Match findings between two versions. A finding is considered "persistent"
 * if its title similarity to a finding in the other version exceeds the threshold
 * AND they share the same category.
 */
function compareFindings(
  oldFindings: Finding[],
  newFindings: Finding[]
): ComparedFinding[] {
  const result: ComparedFinding[] = [];
  const matchedOld = new Set<number>();
  const matchedNew = new Set<number>();

  // Build a match matrix: each new finding tries to match the best old finding
  for (let ni = 0; ni < newFindings.length; ni++) {
    let bestScore = 0;
    let bestOldIdx = -1;

    for (let oi = 0; oi < oldFindings.length; oi++) {
      if (matchedOld.has(oi)) continue;

      // Category must match for similarity to count
      const catMatch =
        oldFindings[oi].category.toLowerCase() === newFindings[ni].category.toLowerCase();
      if (!catMatch) continue;

      const score = titleSimilarity(oldFindings[oi].title, newFindings[ni].title);
      if (score > bestScore) {
        bestScore = score;
        bestOldIdx = oi;
      }
    }

    if (bestScore >= SIMILARITY_THRESHOLD && bestOldIdx >= 0) {
      matchedOld.add(bestOldIdx);
      matchedNew.add(ni);
      result.push({
        status: "persistent",
        finding: newFindings[ni],
        matchedFinding: oldFindings[bestOldIdx],
      });
    }
  }

  // Unmatched old findings = resolved
  for (let oi = 0; oi < oldFindings.length; oi++) {
    if (!matchedOld.has(oi)) {
      result.push({ status: "resolved", finding: oldFindings[oi] });
    }
  }

  // Unmatched new findings = new
  for (let ni = 0; ni < newFindings.length; ni++) {
    if (!matchedNew.has(ni)) {
      result.push({ status: "new", finding: newFindings[ni] });
    }
  }

  // Sort: persistent first, then new, then resolved
  const ORDER: Record<ComparisonStatus, number> = { persistent: 0, new: 1, resolved: 2 };
  result.sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return result;
}

/**
 * Convert LLM-powered VersionComparison data into ComparedFinding[] for rendering.
 * Uses the structured data directly instead of client-side similarity matching.
 */
function fromVersionComparisonData(
  vc: VersionComparisonData,
  oldFindings: Finding[],
  newFindings: Finding[],
): ComparedFinding[] {
  const result: ComparedFinding[] = [];

  // Resolved = previous findings addressed in the new version
  for (const rf of vc.resolvedFindings) {
    const prevFinding = oldFindings[rf.previousFindingIndex];
    if (prevFinding) {
      result.push({
        status: "resolved",
        finding: prevFinding,
        reasoning: rf.reasoning,
      });
    }
  }

  // Persistent = findings present in both versions
  for (const pf of vc.persistentFindings) {
    const prevFinding = oldFindings[pf.previousFindingIndex];
    // Try to find the current finding by title match
    const currentFinding = newFindings.find((f) => f.title === pf.currentTitle);
    result.push({
      status: "persistent",
      finding: currentFinding ?? {
        title: pf.currentTitle,
        severity: pf.severity,
        category: pf.category,
        description: "",
        locations: [],
      },
      matchedFinding: prevFinding,
      conflicted: pf.conflicted,
    });
  }

  // New = findings only in the current version
  for (const nf of vc.newFindings) {
    const currentFinding = newFindings.find((f) => f.title === nf.title);
    result.push({
      status: "new",
      finding: currentFinding ?? {
        title: nf.title,
        severity: nf.severity,
        category: nf.category,
        description: "",
        locations: [],
      },
    });
  }

  // Sort: persistent first, then new, then resolved
  const ORDER: Record<ComparisonStatus, number> = { persistent: 0, new: 1, resolved: 2 };
  result.sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return result;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const severityIcon: Record<Severity, typeof AlertOctagon> = {
  critical: AlertOctagon,
  major: AlertTriangle,
  minor: AlertCircle,
  suggestion: Lightbulb,
};

const severityColor: Record<Severity, string> = {
  critical: "text-red-400",
  major: "text-orange-400",
  minor: "text-yellow-400",
  suggestion: "text-blue-400",
};

const statusConfig: Record<
  ComparisonStatus,
  { label: string; bgClass: string; textClass: string; borderClass: string }
> = {
  resolved: {
    label: "Resolved",
    bgClass: "bg-emerald-500/15",
    textClass: "text-emerald-400",
    borderClass: "border-l-emerald-500",
  },
  persistent: {
    label: "Persistent",
    bgClass: "bg-amber-500/15",
    textClass: "text-amber-400",
    borderClass: "border-l-amber-500",
  },
  new: {
    label: "New",
    bgClass: "bg-red-500/15",
    textClass: "text-red-400",
    borderClass: "border-l-red-500",
  },
};

function ComparedFindingCard({ item }: { item: ComparedFinding }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[item.status];
  const SevIcon = severityIcon[item.finding.severity] ?? AlertCircle;
  const sevColor = severityColor[item.finding.severity] ?? "text-slate-400";

  return (
    <div
      className={cn(
        "rounded-lg border-l-4 border border-white/5 bg-white/[0.02] dark:bg-white/[0.02]",
        cfg.borderClass
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <SevIcon className={cn("mt-0.5 size-4 shrink-0", sevColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200 dark:text-slate-200">
              {item.finding.title}
            </span>
            <Badge className={cn("text-[10px]", cfg.bgClass, cfg.textClass)}>
              {cfg.label}
            </Badge>
          </div>
          {!expanded && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 line-clamp-1">
              {item.finding.description}
            </p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="mt-0.5 size-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2">
          <p className="text-sm text-slate-300 dark:text-slate-400">
            {item.finding.description}
          </p>
          {item.status === "resolved" && item.reasoning && (
            <div className="rounded-md bg-emerald-500/5 border border-emerald-500/10 p-2">
              <p className="text-xs font-medium text-emerald-400 mb-1">Resolution:</p>
              <p className="text-xs text-slate-400">{item.reasoning}</p>
            </div>
          )}
          {item.status === "persistent" && item.matchedFinding && (
            <div className="rounded-md bg-amber-500/5 border border-amber-500/10 p-2">
              <p className="text-xs font-medium text-amber-400 mb-1">Previous version:</p>
              <p className="text-xs text-slate-400">{item.matchedFinding.description}</p>
            </div>
          )}
          {item.conflicted && (
            <p className="text-[10px] text-amber-500/70 italic">
              Note: Check groups disagreed on whether this was resolved.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function VersionTimeline({
  versions,
  selectedLeft,
  selectedRight,
  onSelectLeft,
  onSelectRight,
}: {
  versions: VersionInfo[];
  selectedLeft: number;
  selectedRight: number;
  onSelectLeft: (idx: number) => void;
  onSelectRight: (idx: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {versions.map((v, idx) => {
        const isLeft = idx === selectedLeft;
        const isRight = idx === selectedRight;
        const dateStr = new Date(v.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

        return (
          <div key={v.reviewId} className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => {
                // Clicking toggles between selecting as left or right comparison target
                if (isLeft) return;
                if (isRight) return;
                // If this is older than current right, set as left; otherwise as right
                if (idx < selectedRight) {
                  onSelectLeft(idx);
                } else {
                  onSelectRight(idx);
                }
              }}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                isLeft && "border-blue-500 bg-blue-500/20 text-blue-400",
                isRight && "border-purple-500 bg-purple-500/20 text-purple-400",
                !isLeft && !isRight && "border-white/10 bg-white/5 text-slate-400 hover:border-white/30"
              )}
              title={`v${v.versionNumber} — ${v.fileName ?? "Unknown"}`}
            >
              v{v.versionNumber}
            </button>
            <span className="text-[10px] text-slate-500">{dateStr}</span>
            {(isLeft || isRight) && (
              <span
                className={cn(
                  "text-[10px] font-medium",
                  isLeft ? "text-blue-400" : "text-purple-400"
                )}
              >
                {isLeft ? "Old" : "New"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VersionComparison(props: VersionComparisonProps) {
  const { versions } = props;
  const [selectedLeft, setSelectedLeft] = useState(0);
  const [selectedRight, setSelectedRight] = useState(Math.max(versions.length - 1, 0));
  const [feedbackCache, setFeedbackCache] = useState<Record<string, MergedFeedback | null>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());

  // Fetch feedback data for a review
  const fetchFeedback = async (rid: string) => {
    if (feedbackCache[rid] !== undefined || loading.has(rid)) return;

    setLoading((prev) => new Set(prev).add(rid));
    try {
      const res = await fetch(`/api/review/${rid}`);
      if (!res.ok) {
        setFeedbackCache((prev) => ({ ...prev, [rid]: null }));
        return;
      }
      const data = await res.json();
      const feedback = data.feedback as MergedFeedback | null;
      setFeedbackCache((prev) => ({ ...prev, [rid]: feedback ?? null }));
    } catch {
      setFeedbackCache((prev) => ({ ...prev, [rid]: null }));
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(rid);
        return next;
      });
    }
  };

  // Fetch feedback for selected versions
  const leftVersion = versions[selectedLeft];
  const rightVersion = versions[selectedRight];

  useEffect(() => {
    if (leftVersion) fetchFeedback(leftVersion.reviewId);
    if (rightVersion) fetchFeedback(rightVersion.reviewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftVersion?.reviewId, rightVersion?.reviewId]);

  const leftFeedback = leftVersion ? feedbackCache[leftVersion.reviewId] : null;
  const rightFeedback = rightVersion ? feedbackCache[rightVersion.reviewId] : null;

  const isLoading =
    (leftVersion && loading.has(leftVersion.reviewId)) ||
    (rightVersion && loading.has(rightVersion.reviewId));

  const comparison = useMemo(() => {
    if (!leftFeedback?.findings || !rightFeedback?.findings) return null;

    // Prefer LLM-powered version comparison when available and matching
    const vc = rightFeedback.versionComparison;
    if (vc && vc.previousReviewId === leftVersion?.reviewId) {
      return fromVersionComparisonData(vc, leftFeedback.findings, rightFeedback.findings);
    }

    // Fall back to client-side similarity matching for legacy reviews
    return compareFindings(leftFeedback.findings, rightFeedback.findings);
  }, [leftFeedback, rightFeedback, leftVersion?.reviewId]);

  const stats = useMemo(() => {
    if (!comparison) return { resolved: 0, persistent: 0, new: 0 };
    return {
      resolved: comparison.filter((c) => c.status === "resolved").length,
      persistent: comparison.filter((c) => c.status === "persistent").length,
      new: comparison.filter((c) => c.status === "new").length,
    };
  }, [comparison]);

  if (versions.length < 2) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
        <GitCompareArrows className="mx-auto mb-3 size-8 text-slate-500" />
        <p className="text-sm text-slate-400">
          Link at least two review versions to compare findings between submissions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Version timeline */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300 flex items-center gap-2">
          <GitCompareArrows className="size-4" />
          Version Timeline
        </h3>
        <VersionTimeline
          versions={versions}
          selectedLeft={selectedLeft}
          selectedRight={selectedRight}
          onSelectLeft={setSelectedLeft}
          onSelectRight={setSelectedRight}
        />
      </div>

      {/* Summary stats */}
      {comparison && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
            <CheckCircle2 className="mx-auto mb-1 size-5 text-emerald-400" />
            <p className="text-lg font-bold text-emerald-400">{stats.resolved}</p>
            <p className="text-xs text-emerald-400/70">Resolved</p>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
            <AlertTriangle className="mx-auto mb-1 size-5 text-amber-400" />
            <p className="text-lg font-bold text-amber-400">{stats.persistent}</p>
            <p className="text-xs text-amber-400/70">Persistent</p>
          </div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
            <Plus className="mx-auto mb-1 size-5 text-red-400" />
            <p className="text-lg font-bold text-red-400">{stats.new}</p>
            <p className="text-xs text-red-400/70">New</p>
          </div>
        </div>
      )}

      {/* LLM improvement summary */}
      {rightFeedback?.versionComparison?.previousReviewId === leftVersion?.reviewId &&
        rightFeedback.versionComparison.improvementSummary && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-sm text-slate-300">
            {rightFeedback.versionComparison.improvementSummary}
          </p>
        </div>
      )}

      {/* Comparison header */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Comparing{" "}
          <span className="text-blue-400 font-medium">
            v{leftVersion?.versionNumber}
          </span>
          {" "}to{" "}
          <span className="text-purple-400 font-medium">
            v{rightVersion?.versionNumber}
          </span>
        </span>
        {comparison && (
          <span>
            {leftFeedback?.findings?.length ?? 0} to{" "}
            {rightFeedback?.findings?.length ?? 0} findings
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-400">Loading review data...</span>
        </div>
      )}

      {/* Comparison results */}
      {comparison && !isLoading && (
        <div className="space-y-2">
          {comparison.map((item, idx) => (
            <ComparedFindingCard key={`${item.status}-${idx}`} item={item} />
          ))}

          {comparison.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              No findings to compare. Both versions may have no results yet.
            </p>
          )}
        </div>
      )}

      {/* No feedback available */}
      {!isLoading && !comparison && (
        <p className="py-8 text-center text-sm text-slate-500">
          Feedback data is not yet available for one or both selected versions.
        </p>
      )}
    </div>
  );
}
