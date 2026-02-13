"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, GitCompareArrows } from "lucide-react";
import { UserMenu } from "@/components/auth/user-menu";
import type { Finding, MergedFeedback, Severity } from "@/types/review";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewSummary {
  id: string;
  fileName: string | null;
  createdAt: string;
  feedback: MergedFeedback;
}

interface CompareResponse {
  a: ReviewSummary;
  b: ReviewSummary;
}

type DiffStatus = "resolved" | "new" | "persisting";

interface DiffRow {
  status: DiffStatus;
  findingA: Finding | null;
  findingB: Finding | null;
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function normalizeKey(f: Finding): string {
  return (f.category + "::" + f.title).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Match findings between two reviews. Older review = A (baseline), newer = B.
 * Uses multiset matching: each finding can only match once.
 */
function diffFindings(findingsA: Finding[], findingsB: Finding[]): DiffRow[] {
  // Build map for B: key -> Finding[] (mutable, we pop as we match)
  const mapB = new Map<string, Finding[]>();
  for (const f of findingsB) {
    const key = normalizeKey(f);
    const arr = mapB.get(key) ?? [];
    arr.push(f);
    mapB.set(key, arr);
  }

  const rows: DiffRow[] = [];

  // Walk A findings in order
  for (const fA of findingsA) {
    const key = normalizeKey(fA);
    const bucket = mapB.get(key);
    if (bucket && bucket.length > 0) {
      const fB = bucket.shift()!;
      rows.push({ status: "persisting", findingA: fA, findingB: fB });
    } else {
      rows.push({ status: "resolved", findingA: fA, findingB: null });
    }
  }

  // Remaining unmatched B findings are "new"
  for (const [, bucket] of mapB) {
    for (const fB of bucket) {
      rows.push({ status: "new", findingA: null, findingB: fB });
    }
  }

  // Sort: persisting first, then resolved, then new
  const order: Record<DiffStatus, number> = { persisting: 0, resolved: 1, new: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status]);

  return rows;
}

// ---------------------------------------------------------------------------
// Severity badge (reused)
// ---------------------------------------------------------------------------

const severityColors: Record<Severity, string> = {
  critical: "bg-red-500/20 text-red-400",
  major: "bg-orange-500/20 text-orange-400",
  minor: "bg-yellow-500/20 text-yellow-400",
  suggestion: "bg-blue-500/20 text-blue-400",
};

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cn("inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium", severityColors[severity])}>
      {severity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Diff status config
// ---------------------------------------------------------------------------

const diffConfig: Record<DiffStatus, { label: string; bg: string; border: string; text: string }> = {
  resolved: {
    label: "Resolved",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
  },
  new: {
    label: "New",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
  },
  persisting: {
    label: "Persisting",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-400",
  },
};

// ---------------------------------------------------------------------------
// Finding card for comparison
// ---------------------------------------------------------------------------

function CompactFindingCard({ finding }: { finding: Finding }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <span className="text-[10px] text-white/30">{finding.category}</span>
      </div>
      <p className="text-xs font-medium text-white/90">{finding.title}</p>
      <p className="text-xs leading-relaxed text-white/50">{finding.description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950"><p className="text-sm text-white/30">Loading...</p></div>}>
      <ComparePageInner />
    </Suspense>
  );
}

function ComparePageInner() {
  const searchParams = useSearchParams();
  const idA = searchParams.get("a");
  const idB = searchParams.get("b");

  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idA || !idB) {
      setError("Two review IDs are required");
      setLoading(false);
      return;
    }

    async function fetchComparison() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reviews/compare?a=${idA}&b=${idB}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to load comparison");
          return;
        }
        const json = await res.json();

        // Sort so older review is always A (baseline)
        if (new Date(json.a.createdAt) > new Date(json.b.createdAt)) {
          setData({ a: json.b, b: json.a });
        } else {
          setData(json);
        }
      } catch {
        setError("Failed to load comparison");
      } finally {
        setLoading(false);
      }
    }

    fetchComparison();
  }, [idA, idB]);

  const diffRows = useMemo(() => {
    if (!data) return [];
    return diffFindings(data.a.feedback.findings, data.b.feedback.findings);
  }, [data]);

  const summary = useMemo(() => {
    const counts = { resolved: 0, new: 0, persisting: 0 };
    for (const row of diffRows) {
      counts[row.status]++;
    }
    return counts;
  }, [diffRows]);

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/20 backdrop-blur-sm">
              <GitCompareArrows className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Compare Reviews</h1>
              <p className="text-xs text-white/40">
                Side-by-side finding comparison
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/reviews">
              <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back to Reviews</span>
              </Button>
            </Link>
            <UserMenu />
          </div>
        </div>

        {/* Content */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl sm:p-5">
          {loading && (
            <p className="py-8 text-center text-sm text-white/30">Loading comparison...</p>
          )}

          {error && (
            <p className="py-8 text-center text-sm text-red-400">{error}</p>
          )}

          {data && !loading && (
            <>
              {/* Review labels */}
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
                    Older (baseline)
                  </p>
                  <p className="text-sm text-white/70">
                    {data.a.fileName ?? "Untitled"}
                  </p>
                  <p className="text-xs text-white/40">
                    {new Date(data.a.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
                    Newer (revised)
                  </p>
                  <p className="text-sm text-white/70">
                    {data.b.fileName ?? "Untitled"}
                  </p>
                  <p className="text-xs text-white/40">
                    {new Date(data.b.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Summary bar */}
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-xs font-medium text-white/50">Summary:</span>
                <span className="text-xs font-semibold text-emerald-400">
                  {summary.resolved} resolved
                </span>
                <span className="text-xs text-white/20">|</span>
                <span className="text-xs font-semibold text-red-400">
                  {summary.new} new
                </span>
                <span className="text-xs text-white/20">|</span>
                <span className="text-xs font-semibold text-yellow-400">
                  {summary.persisting} persisting
                </span>
              </div>

              {diffRows.length === 0 && (
                <p className="py-8 text-center text-sm text-white/30">
                  No findings in either review.
                </p>
              )}

              {/* Diff rows */}
              <div className="space-y-3">
                {diffRows.map((row, i) => {
                  const cfg = diffConfig[row.status];
                  return (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg border p-3",
                        cfg.bg,
                        cfg.border
                      )}
                    >
                      {/* Status label */}
                      <div className="mb-2">
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", cfg.text, cfg.bg)}>
                          {cfg.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {/* Side A */}
                        <div className={cn("rounded-md border border-white/5 bg-white/5 p-3", !row.findingA && "flex items-center justify-center")}>
                          {row.findingA ? (
                            <CompactFindingCard finding={row.findingA} />
                          ) : (
                            <span className="text-xs italic text-white/20">Not present in older review</span>
                          )}
                        </div>

                        {/* Side B */}
                        <div className={cn("rounded-md border border-white/5 bg-white/5 p-3", !row.findingB && "flex items-center justify-center")}>
                          {row.findingB ? (
                            <CompactFindingCard finding={row.findingB} />
                          ) : (
                            <span className="text-xs italic text-white/20">Not present in newer review</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
