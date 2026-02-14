import type { MergedFeedback, Severity, Finding, VersionComparison } from "@/types/review";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeverityCounts {
  critical: number;
  major: number;
  minor: number;
  suggestion: number;
}

export interface IssueComparison {
  title: string;
  severity: Severity;
  category: string;
}

export interface ImprovementSummary {
  /** Severity breakdown of the previous review */
  previousCounts: SeverityCounts;
  /** Severity breakdown of the current review */
  currentCounts: SeverityCounts;
  /** Total findings in the previous review */
  previousTotal: number;
  /** Total findings in the current review */
  currentTotal: number;
  /** Issues present in the previous review but not in the current one (fixed) */
  fixed: IssueComparison[];
  /** Issues present in the current review but not in the previous one (new) */
  newIssues: IssueComparison[];
  /** Issues present in both reviews (persistent) */
  persistent: IssueComparison[];
  /** Overall improvement score: 0-100 (higher is better). Based on weighted severity reduction. */
  improvementScore: number;
  /** Previous review date (ISO string) */
  previousDate: string;
  /** Previous review ID */
  previousReviewId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  suggestion: 1,
};

function countBySeverity(findings: Finding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, major: 0, minor: 0, suggestion: 0 };
  for (const f of findings) {
    counts[f.severity]++;
  }
  return counts;
}

/**
 * Compute a similarity score between two findings based on title and description.
 * Returns a number between 0 and 1 (1 = identical).
 */
function findingSimilarity(a: Finding, b: Finding): number {
  // Exact title match is a strong signal
  const titleA = a.title.toLowerCase().trim();
  const titleB = b.title.toLowerCase().trim();
  if (titleA === titleB) return 1.0;

  // Token overlap for title + description
  const tokensA = new Set(`${a.title} ${a.description}`.toLowerCase().split(/\s+/));
  const tokensB = new Set(`${b.title} ${b.description}`.toLowerCase().split(/\s+/));

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }

  const denominator = Math.min(tokensA.size, tokensB.size);
  if (denominator === 0) return 0;

  const tokenScore = overlap / denominator;

  // Category match boosts similarity
  const categoryBonus = a.category === b.category ? 0.1 : 0;

  return Math.min(tokenScore + categoryBonus, 1.0);
}

const SIMILARITY_THRESHOLD = 0.55;

// ---------------------------------------------------------------------------
// Main comparison function
// ---------------------------------------------------------------------------

/**
 * Compare two MergedFeedback objects and compute an improvement summary.
 * `previous` is the older review, `current` is the newer one.
 */
export function compareReviews(
  previous: MergedFeedback,
  current: MergedFeedback,
  previousDate: string,
  previousReviewId: string
): ImprovementSummary {
  const prevFindings = previous.findings;
  const currFindings = current.findings;

  const previousCounts = countBySeverity(prevFindings);
  const currentCounts = countBySeverity(currFindings);

  // Match findings between previous and current using similarity
  const matchedPrev = new Set<number>();
  const matchedCurr = new Set<number>();
  const persistent: IssueComparison[] = [];

  // Find best matches greedily (prev -> curr)
  for (let pi = 0; pi < prevFindings.length; pi++) {
    let bestScore = 0;
    let bestCi = -1;

    for (let ci = 0; ci < currFindings.length; ci++) {
      if (matchedCurr.has(ci)) continue;
      const score = findingSimilarity(prevFindings[pi], currFindings[ci]);
      if (score > bestScore) {
        bestScore = score;
        bestCi = ci;
      }
    }

    if (bestScore >= SIMILARITY_THRESHOLD && bestCi >= 0) {
      matchedPrev.add(pi);
      matchedCurr.add(bestCi);
      persistent.push({
        title: currFindings[bestCi].title,
        severity: currFindings[bestCi].severity,
        category: currFindings[bestCi].category,
      });
    }
  }

  // Fixed = in previous but not matched to any current finding
  const fixed: IssueComparison[] = [];
  for (let pi = 0; pi < prevFindings.length; pi++) {
    if (!matchedPrev.has(pi)) {
      fixed.push({
        title: prevFindings[pi].title,
        severity: prevFindings[pi].severity,
        category: prevFindings[pi].category,
      });
    }
  }

  // New = in current but not matched to any previous finding
  const newIssues: IssueComparison[] = [];
  for (let ci = 0; ci < currFindings.length; ci++) {
    if (!matchedCurr.has(ci)) {
      newIssues.push({
        title: currFindings[ci].title,
        severity: currFindings[ci].severity,
        category: currFindings[ci].category,
      });
    }
  }

  // Calculate improvement score based on weighted severity reduction
  const prevWeighted = prevFindings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);
  const currWeighted = currFindings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);

  let improvementScore: number;
  if (prevWeighted === 0) {
    // No previous issues — if current also has none, 100%; otherwise 0%
    improvementScore = currWeighted === 0 ? 100 : 0;
  } else {
    // Score = reduction in weighted issues, clamped to 0-100
    const reduction = (prevWeighted - currWeighted) / prevWeighted;
    improvementScore = Math.round(Math.max(0, Math.min(100, reduction * 100)));
  }

  return {
    previousCounts,
    currentCounts,
    previousTotal: prevFindings.length,
    currentTotal: currFindings.length,
    fixed,
    newIssues,
    persistent,
    improvementScore,
    previousDate,
    previousReviewId,
  };
}

// ---------------------------------------------------------------------------
// LLM-powered version comparison → ImprovementSummary converter
// ---------------------------------------------------------------------------

/**
 * Convert a VersionComparison (from LLM-powered pipeline) to an ImprovementSummary.
 * This allows the existing ImprovementSummaryCard to render LLM-sourced data.
 */
export function fromVersionComparison(
  vc: VersionComparison,
  previousFindings: Finding[],
  currentFindings: Finding[],
  previousDate: string,
): ImprovementSummary {
  const previousCounts = countBySeverity(previousFindings);
  const currentCounts = countBySeverity(currentFindings);

  const fixed: IssueComparison[] = vc.resolvedFindings.map((f) => ({
    title: f.title,
    severity: f.severity,
    category: f.category,
  }));

  const newIssues: IssueComparison[] = vc.newFindings.map((f) => ({
    title: f.title,
    severity: f.severity,
    category: f.category,
  }));

  const persistent: IssueComparison[] = vc.persistentFindings.map((f) => ({
    title: f.currentTitle,
    severity: f.severity,
    category: f.category,
  }));

  // Calculate improvement score from weighted severity
  const prevWeighted = previousFindings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);
  const currWeighted = currentFindings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);

  let improvementScore: number;
  if (prevWeighted === 0) {
    improvementScore = currWeighted === 0 ? 100 : 0;
  } else {
    const reduction = (prevWeighted - currWeighted) / prevWeighted;
    improvementScore = Math.round(Math.max(0, Math.min(100, reduction * 100)));
  }

  return {
    previousCounts,
    currentCounts,
    previousTotal: previousFindings.length,
    currentTotal: currentFindings.length,
    fixed,
    newIssues,
    persistent,
    improvementScore,
    previousDate,
    previousReviewId: vc.previousReviewId,
  };
}
