"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
        <p className="mb-3 text-xs text-yellow-400/70">
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
                <ChevronUp className="h-4 w-4 shrink-0 text-white/40" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-white/40" />
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
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-white/40">
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
              <div className="border-t border-slate-100 dark:border-white/5 px-4 pb-2">
                <table className="w-full text-left text-sm">
                  <tbody>
                    {sortedByDate.map((r) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b border-slate-100 dark:border-white/5 transition-colors last:border-0 hover:bg-slate-50 dark:hover:bg-white/5"
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
                            <span className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-300">
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

  // Grouped mode
  const [groupByFile, setGroupByFile] = useState(false);
  const [groupedData, setGroupedData] = useState<GroupedReviewsResponse | null>(null);
  const [groupedLoading, setGroupedLoading] = useState(false);

  const isAdmin = session?.user?.role === "admin";

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchReviews = useCallback(async (p: number, s: SortColumn, d: "asc" | "desc", q: string) => {
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

  const fetchGrouped = useCallback(async (q: string) => {
    setGroupedLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ grouped: "true" });
      if (q) params.set("search", q);
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
      fetchGrouped(debouncedSearch);
    } else {
      fetchReviews(page, sort, dir, debouncedSearch);
    }
  }, [page, sort, dir, debouncedSearch, groupByFile, fetchReviews, fetchGrouped]);

  // Clear selection when table data changes
  useEffect(() => {
    setSelectedIds([]);
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

  function handleRowClick(r: ReviewListItem) {
    if (compareMode) {
      if (r.status === "done") toggleSelection(r.id);
      return;
    }
    router.push(`/review/${r.id}`);
  }

  const thClass = "pb-2 pr-4 text-xs font-medium text-white/40";
  const sortableThClass = `${thClass} cursor-pointer select-none hover:text-slate-700 dark:text-white/70 transition-colors`;

  const isLoading = groupByFile ? groupedLoading : loading;
  const hasData = groupByFile ? !!groupedData : !!data;
  const isEmpty = groupByFile
    ? groupedData?.reviews.length === 0
    : data?.reviews.length === 0;

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/5 blur-3xl dark:bg-purple-500/10" />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 backdrop-blur-sm dark:bg-blue-500/20">
              <ClipboardList className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                {isAdmin ? "All Reviews" : "My Reviews"}
              </h1>
              <p className="text-xs text-slate-500 dark:text-white/40">
                {isLoading && !hasData
                  ? "Loading..."
                  : `${displayTotal} review${displayTotal !== 1 ? "s" : ""}${groupByFile ? ` in ${fileGroups.length} group${fileGroups.length !== 1 ? "s" : ""}` : ""}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className={
                groupByFile
                  ? "border-blue-500/50 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-slate-700 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              }
              onClick={() => {
                setGroupByFile((g) => !g);
                if (!groupByFile) {
                  setCompareMode(false);
                  setSelectedIds([]);
                }
              }}
            >
              <Layers className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{groupByFile ? "Exit Grouping" : "Group by File"}</span>
            </Button>
            {!groupByFile && (
              <Button
                variant="outline"
                className={
                  compareMode
                    ? "border-purple-500/50 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200"
                    : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-slate-700 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                }
                onClick={() => {
                  setCompareMode((m) => !m);
                  setSelectedIds([]);
                }}
              >
                <GitCompareArrows className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{compareMode ? "Exit Compare" : "Compare"}</span>
              </Button>
            )}
            <Link href="/" aria-label="Back to Home">
              <Button variant="outline" className="border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-slate-700 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back to Home</span>
              </Button>
            </Link>
            <UserMenu />
          </div>
        </div>

        {/* Content */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-xl sm:p-5">
          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400 dark:text-white/30" />
            <input
              type="text"
              placeholder="Search by file name, user name, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:border-blue-500/50 dark:focus:bg-white/[0.07]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:text-white/30 dark:hover:text-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

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
          {!groupByFile && data && data.reviews.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10">
                      {compareMode && <th className={thClass} style={{ width: 32 }}></th>}
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
                      <th className="pb-2 text-xs font-medium text-white/40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reviews.map((r) => {
                      const isSelected = selectedIds.includes(r.id);
                      const isSelectable = compareMode && r.status === "done";
                      const canSelect = isSelectable && (isSelected || selectedIds.length < 2);
                      return (
                      <tr
                        key={r.id}
                        className={`cursor-pointer border-b border-slate-100 dark:border-white/5 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${isSelected ? "bg-purple-500/10" : ""}`}
                        onClick={() => handleRowClick(r)}
                      >
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
                        <td className="py-2.5 pr-4 text-xs text-slate-500 dark:text-white/50">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-700 dark:text-white/70">
                          {r.fileName ?? "\u2014"}
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
                        <td className="py-2.5 text-right">
                          {r.status === "done" && (
                            <span className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-300">
                              View &rarr;
                            </span>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Compare mode bar */}
              {compareMode && (
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
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
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                  <p className="text-xs text-slate-400 dark:text-white/30">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-slate-500 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-slate-500 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
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
        </div>
      </div>
    </div>
  );
}
