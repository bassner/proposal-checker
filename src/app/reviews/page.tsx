"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  GitCompareArrows,
} from "lucide-react";
import Link from "next/link";

const STALE_RUNNING_MS = 20 * 60 * 1000; // 20 minutes

interface ReviewListItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  provider: string;
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

type SortColumn = "created_at" | "file_name" | "provider" | "status" | "user_name";

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
    running: { bg: "bg-blue-500/20", text: "text-blue-400", label: "running" },
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

  useEffect(() => {
    fetchReviews(page, sort, dir, debouncedSearch);
  }, [page, sort, dir, debouncedSearch, fetchReviews]);

  // Clear selection when table data changes
  useEffect(() => {
    setSelectedIds([]);
  }, [page, sort, dir, debouncedSearch]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

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
  const sortableThClass = `${thClass} cursor-pointer select-none hover:text-white/70 transition-colors`;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <ClipboardList className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">
                {isAdmin ? "All Reviews" : "My Reviews"}
              </h1>
              <p className="text-xs text-white/40">
                {data ? `${data.total} review${data.total !== 1 ? "s" : ""}` : "Loading..."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className={
                compareMode
                  ? "border-purple-500/50 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200"
                  : "border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
              }
              onClick={() => {
                setCompareMode((m) => !m);
                setSelectedIds([]);
              }}
            >
              <GitCompareArrows className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{compareMode ? "Exit Compare" : "Compare"}</span>
            </Button>
            <Link href="/" aria-label="Back to Home">
              <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back to Home</span>
              </Button>
            </Link>
            <UserMenu />
          </div>
        </div>

        {/* Content */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl sm:p-5">
          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search by file name, user name, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-9 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-blue-500/50 focus:bg-white/[0.07]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {loading && !data && (
            <p className="py-8 text-center text-sm text-white/30">Loading reviews...</p>
          )}

          {error && (
            <p className="py-8 text-center text-sm text-red-400">{error}</p>
          )}

          {data && data.reviews.length === 0 && (
            <p className="py-8 text-center text-sm text-white/30">
              {debouncedSearch ? "No reviews match your search" : "No reviews yet"}
            </p>
          )}

          {data && data.reviews.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      {compareMode && <th className={thClass} style={{ width: 32 }}></th>}
                      <th className={sortableThClass} onClick={() => handleSort("created_at")}>
                        Date <SortIcon column="created_at" activeSort={sort} activeDir={dir} />
                      </th>
                      <th className={sortableThClass} onClick={() => handleSort("file_name")}>
                        File <SortIcon column="file_name" activeSort={sort} activeDir={dir} />
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
                        className={`cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5 ${isSelected ? "bg-purple-500/10" : ""}`}
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
                        <td className="py-2.5 pr-4 text-xs text-white/50">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-white/70">
                          {r.fileName ?? "\u2014"}
                        </td>
                        <td className="hidden py-2.5 pr-4 text-white/50 md:table-cell">{r.provider}</td>
                        <td className="py-2.5 pr-4">
                          {statusBadge(r.status, r.createdAt)}
                        </td>
                        {isAdmin && (
                          <td className="hidden py-2.5 pr-4 text-white/50 lg:table-cell">
                            {r.userName || r.userEmail || r.userId}
                          </td>
                        )}
                        <td className="py-2.5 text-right">
                          {r.status === "done" && (
                            <span className="text-xs text-blue-400 hover:text-blue-300">
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
                  <p className="text-xs text-white/40">
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
                  <p className="text-xs text-white/30">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
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
