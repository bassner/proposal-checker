import assert from "node:assert/strict";
import test from "node:test";

import { computeTotals, csvCell, toCsv } from "../src/lib/analytics-export.ts";

function row(overrides = {}) {
  return {
    reviewId: "r1",
    userEmail: "a@test.local",
    fileName: "proposal.pdf",
    status: "done",
    provider: "azure",
    reviewMode: "proposal",
    findingCount: 3,
    createdAt: "2026-10-01T10:00:00.000Z",
    userId: "u1",
    userName: "Alice",
    userRole: "student",
    model: "luna",
    workflowStatus: "draft",
    completedAt: "2026-10-01T10:05:00.000Z",
    durationSeconds: 300,
    retryCount: 0,
    isShared: false,
    selectedGroups: ["structure", "writing"],
    tags: [],
    versionGroupId: null,
    versionNumber: null,
    overallAssessment: "acceptable",
    criticalCount: 1,
    majorCount: 1,
    minorCount: 1,
    suggestionCount: 0,
    manualFindingCount: 0,
    categoryCounts: { structure: 2, writing: 1 },
    failedGroups: [],
    checksRun: 2,
    checksFailed: 0,
    promptTokens: 100,
    completionTokens: 50,
    reasoningTokens: 10,
    slowestCheckMs: 4000,
    checks: [],
    dismissedCount: 1,
    fixedCount: 0,
    commentCount: 2,
    severityOverrideCount: 0,
    ...overrides,
  };
}

test("csvCell quotes delimiters, quotes, and line breaks", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("csvCell neutralizes formula triggers in strings but not numbers", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("@sum"), "'@sum");
  assert.equal(csvCell("\n=1+1"), "\"'\n=1+1\"");
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell(false), "false");
});

test("toCsv keeps the original columns first and in order", () => {
  const csv = toCsv([row()]);
  assert.ok(csv.startsWith("﻿"));
  const [header, line] = csv.slice(1).split("\r\n");
  assert.ok(
    header.startsWith("review_id,user_email,file_name,status,provider,review_mode,finding_count,created_at,")
  );
  const cells = line.split(",");
  assert.equal(cells.length, header.split(",").length);
  assert.deepEqual(cells.slice(0, 8), [
    "r1",
    "a@test.local",
    "proposal.pdf",
    "done",
    "azure",
    "proposal",
    "3",
    "2026-10-01T10:00:00.000Z",
  ]);
  assert.ok(line.includes("structure;writing"));
});

test("computeTotals aggregates counts and averages over finished reviews", () => {
  const totals = computeTotals([
    row(),
    row({ reviewId: "r2", userId: "u2", status: "error", overallAssessment: null, durationSeconds: 30,
      findingCount: 0, criticalCount: 0, majorCount: 0, minorCount: 0, categoryCounts: {}, checksFailed: 2 }),
    row({ reviewId: "r3", durationSeconds: 100, categoryCounts: { writing: 3 } }),
  ]);
  assert.equal(totals.reviewCount, 3);
  assert.equal(totals.uniqueUsers, 2);
  assert.deepEqual(totals.byStatus, { done: 2, error: 1 });
  assert.deepEqual(totals.byAssessment, { acceptable: 2 });
  assert.equal(totals.findings.total, 6);
  assert.deepEqual(totals.findings.byCategory, { structure: 2, writing: 4 });
  assert.equal(totals.checks.failed, 2);
  assert.equal(totals.avgDurationSeconds, 200);
});

test("computeTotals counts prototype-like keys as plain keys", () => {
  const totals = computeTotals([
    row({ categoryCounts: JSON.parse('{"constructor": 1, "__proto__": 2}'), model: "constructor" }),
    row({ reviewId: "r2", categoryCounts: JSON.parse('{"__proto__": 3}'), model: "__proto__" }),
  ]);
  assert.equal(Object.keys(totals.findings.byCategory).length, 2);
  assert.equal(totals.findings.byCategory.constructor, 1);
  assert.equal(Object.getOwnPropertyDescriptor(totals.findings.byCategory, "__proto__")?.value, 5);
  assert.equal(totals.byModel.constructor, 1);
  assert.equal(Object.getOwnPropertyDescriptor(totals.byModel, "__proto__")?.value, 1);
  assert.match(JSON.stringify(totals.findings.byCategory), /"__proto__":5/);
});

test("computeTotals handles an empty export", () => {
  const totals = computeTotals([]);
  assert.equal(totals.reviewCount, 0);
  assert.equal(totals.avgDurationSeconds, null);
});
