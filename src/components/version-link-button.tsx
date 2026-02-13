"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GitCompareArrows, Search, Loader2, Link2, Unlink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VersionInfo } from "@/components/version-comparison";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionLinkButtonProps {
  /** The current review's ID. */
  reviewId: string;
  /** Current version group info (null if not linked). */
  versions: VersionInfo[];
  groupId: string | null;
  /** Called after a successful link/unlink to refresh parent state. */
  onUpdate: () => void;
}

interface SearchResult {
  id: string;
  fileName: string | null;
  createdAt: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VersionLinkButton({
  reviewId,
  versions,
  groupId,
  onUpdate,
}: VersionLinkButtonProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch("");
      setResults([]);
      setError(null);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setResults([]);
        return;
      }

      setSearching(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/reviews?search=${encodeURIComponent(query)}&limit=10&sort=created_at&dir=desc`
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        // Filter out reviews already in this version group and the current review itself
        const existingIds = new Set(versions.map((v) => v.reviewId));
        existingIds.add(reviewId);
        const filtered = (data.reviews as SearchResult[]).filter(
          (r) => !existingIds.has(r.id)
        );
        setResults(filtered);
      } catch {
        setError("Failed to search reviews");
      } finally {
        setSearching(false);
      }
    },
    [reviewId, versions]
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleLink = async (targetId: string) => {
    setLinking(targetId);
    setError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedReviewId: targetId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to link version");
      }
      setOpen(false);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link version");
    } finally {
      setLinking(null);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}/versions`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unlink");
      setOpen(false);
      onUpdate();
    } catch {
      setError("Failed to unlink from version group");
    } finally {
      setUnlinking(false);
    }
  };

  const isInGroup = groupId !== null && versions.length > 0;
  const currentVersion = versions.find((v) => v.reviewId === reviewId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 text-xs",
            isInGroup
              ? "text-blue-400 hover:text-blue-300"
              : "text-slate-400 hover:text-slate-300"
          )}
        >
          <GitCompareArrows className="size-3.5" />
          {isInGroup ? `v${currentVersion?.versionNumber ?? "?"}` : "Link Version"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-white/10 bg-slate-900 p-0"
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">
              {isInGroup ? "Version Group" : "Link as Version"}
            </h4>
            {isInGroup && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleUnlink}
                disabled={unlinking}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                {unlinking ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Unlink className="size-3" />
                )}
                <span className="ml-1">Unlink</span>
              </Button>
            )}
          </div>

          {/* Existing versions in group */}
          {isInGroup && versions.length > 0 && (
            <div className="space-y-1">
              {versions.map((v) => (
                <div
                  key={v.reviewId}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                    v.reviewId === reviewId
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-slate-400"
                  )}
                >
                  <span className="font-mono font-medium">v{v.versionNumber}</span>
                  <span className="truncate flex-1">
                    {v.fileName ?? "Untitled"}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {new Date(v.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Separator */}
          <div className="border-t border-white/10" />

          {/* Search for reviews to link */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by filename..."
              className="h-8 w-full rounded-md border border-white/10 bg-white/5 pl-8 pr-8 text-xs text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setResults([]);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Search results */}
          {searching && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="size-4 animate-spin text-slate-500" />
            </div>
          )}

          {!searching && results.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleLink(r.id)}
                  disabled={linking !== null}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
                >
                  {linking === r.id ? (
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                  ) : (
                    <Link2 className="size-3 shrink-0 text-slate-500" />
                  )}
                  <span className="truncate flex-1">
                    {r.fileName ?? "Untitled"}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {new Date(r.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!searching && search.length >= 2 && results.length === 0 && (
            <p className="py-2 text-center text-xs text-slate-500">
              No matching reviews found.
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
