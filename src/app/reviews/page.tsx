"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import { ClipboardList, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
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

export default function ReviewsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;

  const isAdmin = session?.user?.role === "admin";

  const fetchReviews = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews?page=${p}&limit=${limit}`);
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
    fetchReviews(page);
  }, [page, fetchReviews]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
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
            <Link href="/">
              <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
            <UserMenu />
          </div>
        </div>

        {/* Content */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          {loading && !data && (
            <p className="py-8 text-center text-sm text-white/30">Loading reviews...</p>
          )}

          {error && (
            <p className="py-8 text-center text-sm text-red-400">{error}</p>
          )}

          {data && data.reviews.length === 0 && (
            <p className="py-8 text-center text-sm text-white/30">No reviews yet</p>
          )}

          {data && data.reviews.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="pb-2 pr-4 text-xs font-medium text-white/40">Date</th>
                      <th className="pb-2 pr-4 text-xs font-medium text-white/40">File</th>
                      <th className="pb-2 pr-4 text-xs font-medium text-white/40">Provider</th>
                      <th className="pb-2 pr-4 text-xs font-medium text-white/40">Status</th>
                      {isAdmin && (
                        <th className="pb-2 pr-4 text-xs font-medium text-white/40">User</th>
                      )}
                      <th className="pb-2 text-xs font-medium text-white/40"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reviews.map((r) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5"
                        onClick={() => router.push(`/review/${r.id}`)}
                      >
                        <td className="py-2.5 pr-4 text-xs text-white/50">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-white/70">
                          {r.fileName ?? "\u2014"}
                        </td>
                        <td className="py-2.5 pr-4 text-white/50">{r.provider}</td>
                        <td className="py-2.5 pr-4">
                          {statusBadge(r.status, r.createdAt)}
                        </td>
                        {isAdmin && (
                          <td className="py-2.5 pr-4 text-white/50">
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
                    ))}
                  </tbody>
                </table>
              </div>

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
