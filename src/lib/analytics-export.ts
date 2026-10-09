// ---------------------------------------------------------------------------
// Admin analytics export: row shape, CSV serialization, and totals.
// Kept free of server-only imports so it can be unit-tested directly.
// ---------------------------------------------------------------------------

export interface AnalyticsExportCheck {
  checkGroup: string;
  status: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
}

export interface AnalyticsExportRow {
  // Original columns (kept first and unchanged for existing consumers)
  reviewId: string;
  userEmail: string;
  fileName: string | null;
  status: string;
  provider: string;
  reviewMode: string;
  findingCount: number;
  createdAt: string;
  // User
  userId: string;
  userName: string;
  /** Current role from the users table (not necessarily the role at review time). */
  userRole: string | null;
  // Review metadata
  model: string | null;
  workflowStatus: string;
  completedAt: string | null;
  durationSeconds: number | null;
  retryCount: number;
  isShared: boolean;
  selectedGroups: string[];
  tags: string[];
  versionGroupId: string | null;
  versionNumber: number | null;
  // Result
  overallAssessment: string | null;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  suggestionCount: number;
  manualFindingCount: number;
  categoryCounts: Record<string, number>;
  failedGroups: string[];
  // Check runs (from check_performance; merge step not included)
  checksRun: number;
  checksFailed: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  slowestCheckMs: number | null;
  checks: AnalyticsExportCheck[];
  // Follow-up activity
  dismissedCount: number;
  fixedCount: number;
  commentCount: number;
  severityOverrideCount: number;
}

type CsvValue = string | number | boolean | null | undefined;

/**
 * Serialize one CSV cell (RFC 4180 quoting). String cells that start with a
 * spreadsheet formula trigger are prefixed with an apostrophe.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return String(value);
  let s = value;
  if (/^[=+\-@\t\r\n]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS: [header: string, get: (r: AnalyticsExportRow) => CsvValue][] = [
  ["review_id", (r) => r.reviewId],
  ["user_email", (r) => r.userEmail],
  ["file_name", (r) => r.fileName],
  ["status", (r) => r.status],
  ["provider", (r) => r.provider],
  ["review_mode", (r) => r.reviewMode],
  ["finding_count", (r) => r.findingCount],
  ["created_at", (r) => r.createdAt],
  ["user_id", (r) => r.userId],
  ["user_name", (r) => r.userName],
  ["user_role", (r) => r.userRole],
  ["model", (r) => r.model],
  ["workflow_status", (r) => r.workflowStatus],
  ["completed_at", (r) => r.completedAt],
  ["duration_seconds", (r) => r.durationSeconds],
  ["retry_count", (r) => r.retryCount],
  ["is_shared", (r) => r.isShared],
  ["selected_groups", (r) => r.selectedGroups.join(";")],
  ["tags", (r) => r.tags.join(";")],
  ["version_group_id", (r) => r.versionGroupId],
  ["version_number", (r) => r.versionNumber],
  ["overall_assessment", (r) => r.overallAssessment],
  ["critical_count", (r) => r.criticalCount],
  ["major_count", (r) => r.majorCount],
  ["minor_count", (r) => r.minorCount],
  ["suggestion_count", (r) => r.suggestionCount],
  ["manual_finding_count", (r) => r.manualFindingCount],
  ["failed_groups", (r) => r.failedGroups.join(";")],
  ["checks_run", (r) => r.checksRun],
  ["checks_failed", (r) => r.checksFailed],
  ["prompt_tokens", (r) => r.promptTokens],
  ["completion_tokens", (r) => r.completionTokens],
  ["reasoning_tokens", (r) => r.reasoningTokens],
  ["slowest_check_ms", (r) => r.slowestCheckMs],
  ["dismissed_count", (r) => r.dismissedCount],
  ["fixed_count", (r) => r.fixedCount],
  ["comment_count", (r) => r.commentCount],
  ["severity_override_count", (r) => r.severityOverrideCount],
];

/** One row per review. Starts with a UTF-8 BOM so Excel reads umlauts correctly. */
export function toCsv(rows: AnalyticsExportRow[]): string {
  const header = CSV_COLUMNS.map(([h]) => h).join(",");
  const lines = rows.map((r) => CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(","));
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

// Counts are kept in a Map so keys like "__proto__" or "constructor"
// (e.g. from manual finding categories) are counted like any other key.
function addCount(counts: Map<string, number>, key: string, n: number): void {
  counts.set(key, (counts.get(key) ?? 0) + n);
}

function countBy(rows: AnalyticsExportRow[], key: (r: AnalyticsExportRow) => string | null): Record<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) addCount(counts, key(r) ?? "unknown", 1);
  return Object.fromEntries(counts);
}

function sum(rows: AnalyticsExportRow[], get: (r: AnalyticsExportRow) => number): number {
  return rows.reduce((acc, r) => acc + get(r), 0);
}

export interface AnalyticsExportTotals {
  reviewCount: number;
  uniqueUsers: number;
  byStatus: Record<string, number>;
  byAssessment: Record<string, number>;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byReviewMode: Record<string, number>;
  byUserRole: Record<string, number>;
  findings: {
    total: number;
    critical: number;
    major: number;
    minor: number;
    suggestion: number;
    manual: number;
    dismissed: number;
    fixed: number;
    byCategory: Record<string, number>;
  };
  checks: { run: number; failed: number };
  tokens: { prompt: number; completion: number; reasoning: number };
  avgDurationSeconds: number | null;
}

export function computeTotals(rows: AnalyticsExportRow[]): AnalyticsExportTotals {
  const byCategory = new Map<string, number>();
  for (const r of rows) {
    for (const [cat, n] of Object.entries(r.categoryCounts)) addCount(byCategory, cat, n);
  }
  const timed = rows.filter((r) => r.status === "done" && r.durationSeconds !== null);

  return {
    reviewCount: rows.length,
    uniqueUsers: new Set(rows.map((r) => r.userId)).size,
    byStatus: countBy(rows, (r) => r.status),
    byAssessment: countBy(rows.filter((r) => r.status === "done"), (r) => r.overallAssessment),
    byProvider: countBy(rows, (r) => r.provider),
    byModel: countBy(rows, (r) => r.model),
    byReviewMode: countBy(rows, (r) => r.reviewMode),
    byUserRole: countBy(rows, (r) => r.userRole),
    findings: {
      total: sum(rows, (r) => r.findingCount),
      critical: sum(rows, (r) => r.criticalCount),
      major: sum(rows, (r) => r.majorCount),
      minor: sum(rows, (r) => r.minorCount),
      suggestion: sum(rows, (r) => r.suggestionCount),
      manual: sum(rows, (r) => r.manualFindingCount),
      dismissed: sum(rows, (r) => r.dismissedCount),
      fixed: sum(rows, (r) => r.fixedCount),
      byCategory: Object.fromEntries(byCategory),
    },
    checks: {
      run: sum(rows, (r) => r.checksRun),
      failed: sum(rows, (r) => r.checksFailed),
    },
    tokens: {
      prompt: sum(rows, (r) => r.promptTokens),
      completion: sum(rows, (r) => r.completionTokens),
      reasoning: sum(rows, (r) => r.reasoningTokens),
    },
    avgDurationSeconds: timed.length
      ? Math.round(sum(timed, (r) => r.durationSeconds ?? 0) / timed.length)
      : null,
  };
}
