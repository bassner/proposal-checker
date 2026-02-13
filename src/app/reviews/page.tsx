"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  GitCompareArrows,
  Layers,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import Link from "next/link";
import { DeleteReviewButton } from "@/components/delete-review-button";
import { PinButton } from "@/components/pin-button";
import { BulkActionsBar } from "@/components/admin/bulk-actions-bar";
import { Tag, Filter, User } from "lucide-react";

const STALE_RUNNING_MS = 20 * 60 * 1000; // 20 minutes

interface ReviewListItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  provider: string;
  reviewMode: string;
  status: string;
  fileName: string | null;
  createdAt: string;
  isPinned: boolean;
  workflowStatus: string;
  tags: string[];
}

interface ReviewsResponse {
  reviews: ReviewListItem[];
  total: number;
  page: number;
  limit: number;
}

interface GroupedReviewItem {
  id: string;
  fileName: string | null;
  userId: string;
  userName: string;
  createdAt: string;
  status: string;
  findingCount: number;
}

interface GroupedReviewsResponse {
  reviews: GroupedReviewItem[];
  total: number;
  truncated: boolean;
  grouped: true;
}

type SortColumn = "created_at" | "file_name" | "provider" | "status" | "user_name";

// ---------------------------------------------------------------------------
// Tag color helper (same hash as review-tags.tsx for consistency)
// ---------------------------------------------------------------------------

const TAG_COLORS = [
  { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/25" },
  { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/25" },
  { bg: "bg-green-500/15", text: "text-green-600 dark:text-green-400", border: "border-green-500/25" },
  { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/25" },
  { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/25" },
  { bg: "bg-cyan-500/15", text: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-500/25" },
  { bg: "bg-indigo-500/15", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/25" },
  { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/25" },
  { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/25" },
  { bg: "bg-pink-500/15", text: "text-pink-600 dark:text-pink-400", border: "border-pink-500/25" },
];

function hashTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function TagPill({ tag }: { tag: string }) {
  const color = hashTagColor(tag);
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${color.bg} ${color.text} ${color.border}`}>
      {tag}
    </span>
  );
}

// ---------------------------------------------------------------------------
// File name normalization for grouping
// ---------------------------------------------------------------------------

/** Strip common revision suffixes to group related files together. */
function normalizeFileName(name: string): string {
  let base = name
    .replace(/\.pdf$/i, "")
    .trim();

  // Iteratively strip end-anchored revision patterns
  let changed = true;
  while (changed) {
    const before = base;
    base = base
      .replace(/[_\- ]v\d+$/i, "")
      .replace(/[_\- ](final|revised|draft|rev\d*)$/i, "")
      .replace(/\s*\(\d+\)$/, "")
      .trim();
    changed = base !== before;
  }

  return base.toLowerCase();
}

/** Compute trend: "improving" if finding count decreased, "worsening" if increased, "stable" otherwise. */
function computeTrend(reviews: GroupedReviewItem[]): "improving" | "worsening" | "stable" {
  // Only consider completed reviews for trend
  const done = reviews
    .filter((r) => r.status === "done")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (done.length < 2) return "stable";

  const first = done[0].findingCount;
  const last = done[done.length - 1].findingCount;
  if (last < first) return "improving";
  if (last > first) return "worsening";
  return "stable";
}

interface FileGroup {
  key: string;
  displayName: string;
  userName: string | null; // shown for admin
  reviews: GroupedReviewItem[];
  trend: "improving" | "worsening" | "stable";
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string, createdAt: string) {
  const isStale = status === "running" && Date.now() - new Date(createdAt).getTime() > STALE_RUNNING_MS;

  if (isStale) {
    return (
      <span className="inline-block rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
        interrupted
      </span>
    );
  }

  const config: Record<string, { bg: string; text: string; label: string }> = {
    done: { bg: "bg-green-500/20", text: "text-green-400", label: "done" },
    error: { bg: "bg-red-500/20", text: "text-red-400", label: "error" },
    running: { bg: "bg-blue-500/20", text: "text-blue-500 dark:text-blue-400", label: "running" },
  };
  const c = config[status] ?? config.running;

  return (
    <span className={`inline-block rounded-full ${c.bg} px-2 py-0.5 text-[10px] font-medium ${c.text}`}>
      {c.label}
    </span>
  );
}

function SortIcon({ column, activeSort, activeDir }: { column: string; activeSort: string; activeDir: "asc" | "desc" }) {
  if (column !== activeSort) {
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
  }
  return activeDir === "asc"
    ? <ArrowUp className="ml-1 inline h-3 w-3" />
    : <ArrowDown className="ml-1 inline h-3 w-3" />;
}

function TrendIcon({ trend }: { trend: "improving" | "worsening" | "stable" }) {
  switch (trend) {
    case "improving":
      return <TrendingDown className="inline h-3.5 w-3.5 text-green-400" />;
    case "worsening":
      return <TrendingUp className="inline h-3.5 w-3.5 text-red-400" />;
    default:
      return <Minus className="inline h-3.5 w-3.5 text-slate-400 dark:text-white/30" />;
  }
}

// ---------------------------------------------------------------------------
// Grouped view component
// ---------------------------------------------------------------------------

function GroupedView({
  groups,
  truncated,
  total,
  isAdmin,
}: {
  groups: FileGroup[];
  truncated: boolean;
  total: number;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const router = useRouter();

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {truncated && (
        <p className="mb-3 text-xs text-yellow-600 dark:text-yellow-400/70">
          Showing 500 of {total} reviews. Use search to narrow results.
        </p>
      )}
      {groups.map((group) => {
        const isOpen = expanded.has(group.key);
        const doneReviews = group.reviews.filter((r) => r.status === "done");
        const sortedByDate = [...group.reviews].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        return (
          <div
            key={group.key}
            className="rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"
          >
            {/* Group header */}
            <button
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
              onClick={() => toggleGroup(group.key)}
            >
              {isOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-slate-400 dark:text-white/40" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 dark:text-white/40" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-800 dark:text-white/80">
                    {group.displayName}
                  </span>
                  {isAdmin && group.userName && (
                    <span className="shrink-0 text-xs text-slate-400 dark:text-white/30">
                      by {group.userName}
                    </span>
                  )}
                </div>
                {/* Mini timeline */}
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-400 dark:text-white/40">
                  {sortedByDate.map((r, i) => (
                    <span key={r.id} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-300 dark:text-white/20">{"\u2192"}</span>}
                      <span className={r.status === "done" ? "text-slate-500 dark:text-white/50" : "text-slate-300 dark:text-white/25"}>
                        {r.status === "done" ? `${r.findingCount} findings` : r.status}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <TrendIcon trend={group.trend} />
                <span className="text-xs text-slate-500 dark:text-white/40">
                  {group.reviews.length} revision{group.reviews.length !== 1 ? "s" : ""}
                  {doneReviews.length > 0 && doneReviews.length !== group.reviews.length && (
                    <>, {doneReviews.length} done</>
                  )}
                </span>
              </div>
            </button>

            {/* Expanded detail rows */}
            {isOpen && (
              <div className="border-t border-slate-100 px-4 pb-2 dark:border-white/5">
                <table className="w-full text-left text-sm">
                  <tbody>
                    {sortedByDate.map((r) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
                        onClick={() => router.push(`/review/${r.id}`)}
                      >
                        <td className="py-2 pr-4 text-xs text-slate-500 dark:text-white/50">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">
                          {statusBadge(r.status, r.createdAt)}
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-500 dark:text-white/50">
                          {r.status === "done" ? (
                            <span>
                              {r.findingCount} finding{r.findingCount !== 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-white/25">{"\u2014"}</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {r.status === "done" && (
                            <span className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
                              View &rarr;
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {groups.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">No reviews to group</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"><p className="text-sm text-white/30">Loading...</p></div>}>
      <ReviewsPageInner />
    </Suspense>
  );
}

function ReviewsPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [sort, setSort] = useState<SortColumn>("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Tag filter
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showTagFilter, setShowTagFilter] = useState(false);

  // Grouped mode
  const [groupByFile, setGroupByFile] = useState(false);
  const [groupedData, setGroupedData] = useState<GroupedReviewsResponse | null>(null);
  const [groupedLoading, setGroupedLoading] = useState(false);

  // Bulk selection (admin only, separate from compare selection)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

  const isAdmin = session?.user?.role === "admin";
  const searchParams = useSearchParams();
  const [mineOnly, setMineOnly] = useState(() => searchParams.get("mine") === "true");
  const [refreshKey, setRefreshKey] = useState(0);
  const handleDeleted = useCallback(() => setRefreshKey((k) => k + 1), []);
  const handlePinToggle = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchReviews = useCallback(async (p: number, s: SortColumn, d: "asc" | "desc", q: string, mine: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(limit),
        sort: s,
        dir: d,
      });
      if (q) params.set("search", q);
      if (mine) params.set("mine", "true");
      const res = await fetch(`/api/reviews?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to load reviews");
        return;
      }
      setData(await res.json());
    } catch {
      setError("Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGrouped = useCallback(async (q: string, mine: boolean) => {
    setGroupedLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ grouped: "true" });
      if (q) params.set("search", q);
      if (mine) params.set("mine", "true");
      const res = await fetch(`/api/reviews?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to load reviews");
        return;
      }
      setGroupedData(await res.json());
    } catch {
      setError("Failed to load reviews");
    } finally {
      setGroupedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (groupByFile) {
      fetchGrouped(debouncedSearch, mineOnly);
    } else {
      fetchReviews(page, sort, dir, debouncedSearch, mineOnly);
    }
  }, [page, sort, dir, debouncedSearch, groupByFile, mineOnly, fetchReviews, fetchGrouped, refreshKey]);

  // Clear selection when table data changes
  useEffect(() => {
    setSelectedIds([]);
    setBulkSelectedIds(new Set());
  }, [page, sort, dir, debouncedSearch]);

  // Build file groups from grouped data
  const fileGroups = useMemo((): FileGroup[] => {
    if (!groupedData) return [];

    const groupMap = new Map<string, GroupedReviewItem[]>();
    const displayNames = new Map<string, string>();

    for (const r of groupedData.reviews) {
      // For admin: group by (userId, normalizedFileName) to avoid cross-user merging
      const rawName = r.fileName ?? "";
      const normalized = rawName ? normalizeFileName(rawName) : "";
      const key = isAdmin
        ? `${r.userId}::${normalized || `__untitled_${r.id}`}`
        : normalized || `__untitled_${r.id}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, []);
        // Use the most recent file name as the display name
        displayNames.set(key, r.fileName || "Untitled");
      }
      groupMap.get(key)!.push(r);

      // Update display name to the most recent review's file name
      const existing = groupMap.get(key)!;
      const newest = existing.reduce((a, b) =>
        new Date(a.createdAt) > new Date(b.createdAt) ? a : b
      );
      displayNames.set(key, newest.fileName || "Untitled");
    }

    const groups: FileGroup[] = [];
    for (const [key, reviews] of groupMap) {
      groups.push({
        key,
        displayName: displayNames.get(key) || "Untitled",
        userName: isAdmin ? reviews[0].userName : null,
        reviews,
        trend: computeTrend(reviews),
      });
    }

    // Sort groups: multi-review groups first, then by most recent review date
    groups.sort((a, b) => {
      if (a.reviews.length > 1 && b.reviews.length <= 1) return -1;
      if (b.reviews.length > 1 && a.reviews.length <= 1) return 1;
      const aDate = Math.max(...a.reviews.map((r) => new Date(r.createdAt).getTime()));
      const bDate = Math.max(...b.reviews.map((r) => new Date(r.createdAt).getTime()));
      return bDate - aDate;
    });

    return groups;
  }, [groupedData, isAdmin]);

  // Collect all unique tags across loaded reviews for the filter dropdown
  const allTags = useMemo(() => {
    if (!data) return [];
    const tagSet = new Set<string>();
    for (const r of data.reviews) {
      for (const t of r.tags ?? []) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [data]);

  // Sort pinned reviews to the top of the current page, apply tag filter
  const sortedReviews = useMemo(() => {
    if (!data) return [];
    let reviews = [...data.reviews];
    if (tagFilter) {
      reviews = reviews.filter((r) => r.tags?.includes(tagFilter));
    }
    return reviews.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0; // preserve server sort order within each group
    });
  }, [data, tagFilter]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;
  const displayTotal = groupByFile
    ? (groupedData?.total ?? 0)
    : (data?.total ?? 0);

  function handleSort(column: SortColumn) {
    if (sort === column) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(column);
      setDir("desc");
    }
    setPage(1);
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev; // max 2
      return [...prev, id];
    });
  }

  function toggleBulkSelection(id: string) {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!sortedReviews.length) return;
    const allIds = sortedReviews.map((r) => r.id);
    const allSelected = allIds.every((id) => bulkSelectedIds.has(id));
    if (allSelected) {
      setBulkSelectedIds(new Set());
    } else {
      setBulkSelectedIds(new Set(allIds));
    }
  }

  const handleBulkClear = useCallback(() => setBulkSelectedIds(new Set()), []);
  const handleBulkComplete = useCallback(() => setRefreshKey((k) => k + 1), []);

  function handleRowClick(r: ReviewListItem) {
    if (compareMode) {
      if (r.status === "done") toggleSelection(r.id);
      return;
    }
    router.push(`/review/${r.id}`);
  }

  const thClass = "pb-2 pr-4 text-xs font-medium text-slate-400 dark:text-white/40";
  const sortableThClass = `${thClass} cursor-pointer select-none hover:text-slate-700 dark:hover:text-white/70 transition-colors`;

  const isLoading = groupByFile ? groupedLoading : loading;
  const hasData = groupByFile ? !!groupedData : !!data;
  const isEmpty = groupByFile
    ? groupedData?.reviews.length === 0
    : data?.reviews.length === 0;

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="background-orbs pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/5 blur-3xl dark:bg-purple-500/10" />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="mb-8 space-y-3">
          {/* Row 1: Title + User menu */}
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 backdrop-blur-sm dark:bg-blue-500/20">
                <ClipboardList className="h-5 w-5 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {isAdmin ? (mineOnly ? "My Reviews" : "All Reviews") : "My Reviews"}
                </h1>
                <p className="text-xs text-slate-500 dark:text-white/40" aria-live="polite">
                  {isLoading && !hasData
                    ? "Loading..."
                    : `${displayTotal} review${displayTotal !== 1 ? "s" : ""}${groupByFile ? ` in ${fileGroups.length} group${fileGroups.length !== 1 ? "s" : ""}` : ""}`}
                </p>
              </div>
            </div>
            <nav aria-label="User navigation" className="ml-auto">
              <UserMenu />
            </nav>
          </div>
          {/* Row 2: Action buttons */}
          <nav aria-label="Reviews actions" className="flex flex-wrap items-center gap-2">
            <Link href="/" aria-label="Back to Home">
              <Button variant="outline" size="sm" className="border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back to Home
              </Button>
            </Link>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className={
                  mineOnly
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
                    : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                }
                onClick={() => { setMineOnly((m) => !m); setPage(1); }}
              >
                <User className="mr-1.5 h-3.5 w-3.5" />
                {mineOnly ? "Show All" : "My Reviews"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className={
                groupByFile
                  ? "border-blue-500/50 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              }
              onClick={() => {
                setGroupByFile((g) => !g);
                if (!groupByFile) {
                  setCompareMode(false);
                  setSelectedIds([]);
                }
              }}
            >
              <Layers className="mr-1.5 h-3.5 w-3.5" />
              {groupByFile ? "Exit Grouping" : "Group by File"}
            </Button>
            {!groupByFile && (
              <Button
                variant="outline"
                size="sm"
                className={
                  compareMode
                    ? "border-purple-500/50 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200"
                    : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                }
                onClick={() => {
                  setCompareMode((m) => !m);
                  setSelectedIds([]);
                }}
              >
                <GitCompareArrows className="mr-1.5 h-3.5 w-3.5" />
                {compareMode ? "Exit Compare" : "Compare"}
              </Button>
            )}
          </nav>
        </header>

        {/* Content */}
        <main id="main-content" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-xl sm:p-5">
          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/30" />
            <input
              type="text"
              placeholder="Search by file name, user, or tag..."
              aria-label="Search reviews"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:border-blue-500/50 dark:focus:bg-white/[0.07]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Tag filter */}
          {!groupByFile && allTags.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <button
                onClick={() => setShowTagFilter((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  tagFilter
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/5"
                }`}
              >
                <Filter className="h-3 w-3" />
                {tagFilter ? (
                  <>
                    <Tag className="h-3 w-3" />
                    {tagFilter}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTagFilter(null);
                      }}
                      className="ml-0.5 rounded-full p-0 opacity-60 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  "Filter by tag"
                )}
              </button>
              {showTagFilter && (
                <div className="flex flex-wrap gap-1">
                  {allTags.map((tag) => {
                    const color = hashTagColor(tag);
                    const isActive = tagFilter === tag;
                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          setTagFilter(isActive ? null : tag);
                          setShowTagFilter(false);
                        }}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          isActive
                            ? `${color.bg} ${color.text} ${color.border} ring-1 ring-blue-400`
                            : `${color.bg} ${color.text} ${color.border} hover:opacity-80`
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isLoading && !hasData && (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">Loading reviews...</p>
          )}

          {error && (
            <p className="py-8 text-center text-sm text-red-400">{error}</p>
          )}

          {hasData && isEmpty && (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">
              {debouncedSearch ? "No reviews match your search" : "No reviews yet"}
            </p>
          )}

          {/* Grouped view */}
          {groupByFile && groupedData && groupedData.reviews.length > 0 && (
            <GroupedView
              groups={fileGroups}
              truncated={groupedData.truncated}
              total={groupedData.total}
              isAdmin={isAdmin}
            />
          )}

          {/* Table view (default) */}
          {!groupByFile && data && sortedReviews.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10">
                      {isAdmin && !compareMode && (
                        <th className={thClass} style={{ width: 32 }}>
                          <input
                            type="checkbox"
                            checked={sortedReviews.length > 0 && sortedReviews.every((r) => bulkSelectedIds.has(r.id))}
                            onChange={toggleSelectAll}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-blue-500 dark:border-white/20"
                            title="Select all"
                          />
                        </th>
                      )}
                      {compareMode && <th className={thClass} style={{ width: 32 }}></th>}
                      <th className={thClass} style={{ width: 32 }}></th>
                      <th className={sortableThClass} onClick={() => handleSort("created_at")}>
                        Date <SortIcon column="created_at" activeSort={sort} activeDir={dir} />
                      </th>
                      <th className={sortableThClass} onClick={() => handleSort("file_name")}>
                        File <SortIcon column="file_name" activeSort={sort} activeDir={dir} />
                      </th>
                      <th className={`${thClass} hidden md:table-cell`}>
                        Mode
                      </th>
                      <th className={`${sortableThClass} hidden md:table-cell`} onClick={() => handleSort("provider")}>
                        Provider <SortIcon column="provider" activeSort={sort} activeDir={dir} />
                      </th>
                      <th className={sortableThClass} onClick={() => handleSort("status")}>
                        Status <SortIcon column="status" activeSort={sort} activeDir={dir} />
                      </th>
                      {isAdmin && (
                        <th className={`${sortableThClass} hidden lg:table-cell`} onClick={() => handleSort("user_name")}>
                          User <SortIcon column="user_name" activeSort={sort} activeDir={dir} />
                        </th>
                      )}
                      <th className="pb-2 text-xs font-medium text-slate-400 dark:text-white/40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedReviews.map((r) => {
                      const isSelected = selectedIds.includes(r.id);
                      const isBulkSelected = bulkSelectedIds.has(r.id);
                      const isSelectable = compareMode && r.status === "done";
                      const canSelect = isSelectable && (isSelected || selectedIds.length < 2);
                      return (
                      <tr
                        key={r.id}
                        className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5 ${isSelected ? "bg-purple-500/10" : ""} ${isBulkSelected ? "bg-blue-500/10" : ""}`}
                        onClick={() => handleRowClick(r)}
                      >
                        {isAdmin && !compareMode && (
                          <td className="py-2.5 pr-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isBulkSelected}
                              onChange={() => toggleBulkSelection(r.id)}
                              className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-blue-500 dark:border-white/20"
                            />
                          </td>
                        )}
                        {compareMode && (
                          <td className="py-2.5 pr-2" onClick={(e) => e.stopPropagation()}>
                            {r.status === "done" ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!canSelect}
                                onChange={() => toggleSelection(r.id)}
                                className="h-3.5 w-3.5 cursor-pointer rounded border-white/20 bg-white/5 accent-purple-500"
                              />
                            ) : (
                              <span className="inline-block h-3.5 w-3.5" />
                            )}
                          </td>
                        )}
                        <td className="py-2.5 pr-1" onClick={(e) => e.stopPropagation()}>
                          <PinButton
                            reviewId={r.id}
                            initialPinned={r.isPinned}
                            onToggle={handlePinToggle}
                          />
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-slate-500 dark:text-white/50">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-700 dark:text-white/70">
                          <div className="flex flex-col gap-1">
                            <span>{r.fileName ?? "\u2014"}</span>
                            {r.tags && r.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {r.tags.map((tag) => (
                                  <TagPill key={tag} tag={tag} />
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="hidden py-2.5 pr-4 md:table-cell">
                          {r.reviewMode === "thesis" ? (
                            <span className="inline-block rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-400">thesis</span>
                          ) : (
                            <span className="text-slate-500 dark:text-white/50">proposal</span>
                          )}
                        </td>
                        <td className="hidden py-2.5 pr-4 text-slate-500 dark:text-white/50 md:table-cell">{r.provider}</td>
                        <td className="py-2.5 pr-4">
                          {statusBadge(r.status, r.createdAt)}
                        </td>
                        {isAdmin && (
                          <td className="hidden py-2.5 pr-4 text-slate-500 dark:text-white/50 lg:table-cell">
                            {r.userName || r.userEmail || r.userId}
                          </td>
                        )}
                        <td className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {r.status === "done" && (
                              <span className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300" onClick={() => router.push(`/review/${r.id}`)}>
                                View &rarr;
                              </span>
                            )}
                            {(isAdmin || r.userId === session?.user?.id) && (
                              <DeleteReviewButton
                                reviewId={r.id}
                                fileName={r.fileName}
                                variant="icon"
                                onDeleted={handleDeleted}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Compare mode bar */}
              {compareMode && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-white/10">
                  <p className="text-xs text-slate-500 dark:text-white/40">
                    {selectedIds.length === 0
                      ? "Select 2 completed reviews to compare"
                      : selectedIds.length === 1
                        ? "Select 1 more review"
                        : "Ready to compare"}
                  </p>
                  {selectedIds.length === 2 && (
                    <Link href={`/reviews/compare?a=${selectedIds[0]}&b=${selectedIds[1]}`}>
                      <Button className="bg-purple-600 text-white hover:bg-purple-500">
                        <GitCompareArrows className="mr-2 h-4 w-4" />
                        Compare
                      </Button>
                    </Link>
                  )}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-white/10">
                  <p className="text-xs text-slate-400 dark:text-white/30">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* Bulk actions bar (admin only) */}
        {isAdmin && (
          <BulkActionsBar
            selectedIds={Array.from(bulkSelectedIds)}
            onClearSelection={handleBulkClear}
            onActionComplete={handleBulkComplete}
          />
        )}
      </div>
    </div>
  );
}
