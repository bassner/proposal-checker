"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Link2, BarChart3, Users } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RelationshipType =
  | "similar_topic"
  | "shared_advisor"
  | "builds_upon"
  | "contradicts"
  | "related";

interface Relationship {
  id: string;
  sourceReviewId: string;
  targetReviewId: string;
  relationshipType: RelationshipType;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  sourceFileName: string | null;
  targetFileName: string | null;
  sourceUserName: string | null;
  targetUserName: string | null;
}

interface Stats {
  countByType: { type: string; count: number }[];
  mostConnected: {
    reviewId: string;
    fileName: string | null;
    userName: string | null;
    count: number;
  }[];
}

// ---------------------------------------------------------------------------
// Badge config
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<
  RelationshipType,
  { label: string; bg: string; text: string; border: string }
> = {
  similar_topic: {
    label: "Similar Topic",
    bg: "bg-blue-500/15",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/25",
  },
  shared_advisor: {
    label: "Shared Advisor",
    bg: "bg-purple-500/15",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-500/25",
  },
  builds_upon: {
    label: "Builds Upon",
    bg: "bg-green-500/15",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-500/25",
  },
  contradicts: {
    label: "Contradicts",
    bg: "bg-red-500/15",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500/25",
  },
  related: {
    label: "Related",
    bg: "bg-slate-500/15",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-500/25",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RelationshipOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/relationships");
        if (!res.ok) throw new Error("Failed to load relationships");
        const data = await res.json();
        if (!cancelled) {
          setStats(data.stats ?? null);
          setRelationships(data.relationships ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error}
      </div>
    );
  }

  const totalCount = stats?.countByType.reduce((sum, c) => sum + c.count, 0) ?? 0;

  if (totalCount === 0) {
    return (
      <p className="py-4 text-center text-xs text-white/30">
        No proposal relationships yet. Supervisors can link related proposals from individual review pages.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Total relationships */}
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Link2 className="h-3.5 w-3.5" />
            Total Relationships
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white/90">
            {totalCount}
          </p>
        </div>

        {/* Unique proposals involved */}
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-xs text-white/40">
            <BarChart3 className="h-3.5 w-3.5" />
            Relationship Types
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white/90">
            {stats?.countByType.length ?? 0}
          </p>
        </div>

        {/* Most connected */}
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Users className="h-3.5 w-3.5" />
            Connected Proposals
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white/90">
            {stats?.mostConnected.length ?? 0}
          </p>
        </div>
      </div>

      {/* Count by type */}
      {stats && stats.countByType.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-white/50">By Type</h3>
          <div className="flex flex-wrap gap-2">
            {stats.countByType.map((item) => {
              const cfg = TYPE_CONFIG[item.type as RelationshipType] ?? TYPE_CONFIG.related;
              return (
                <div
                  key={item.type}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}
                >
                  {cfg.label}
                  <span className="rounded-full bg-black/10 px-1.5 py-0 text-[10px] font-semibold tabular-nums dark:bg-white/10">
                    {item.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Most connected proposals */}
      {stats && stats.mostConnected.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-white/50">Most Connected Proposals</h3>
          <div className="space-y-1">
            {stats.mostConnected.map((item) => (
              <div
                key={item.reviewId}
                className="flex items-center justify-between rounded-md border border-white/8 bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={`/review/${item.reviewId}`}
                    className="truncate text-xs font-medium text-white/70 hover:text-blue-400"
                  >
                    {item.fileName ?? item.reviewId.slice(0, 8)}
                  </a>
                  {item.userName && (
                    <p className="text-[10px] text-white/30">{item.userName}</p>
                  )}
                </div>
                <span className="ml-2 shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white/60">
                  {item.count} link{item.count !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All relationships list */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-white/50">
          All Relationships ({relationships.length})
        </h3>
        <div className="space-y-1">
          {relationships.map((rel) => {
            const cfg = TYPE_CONFIG[rel.relationshipType] ?? TYPE_CONFIG.related;
            return (
              <div
                key={rel.id}
                className="flex items-start gap-3 rounded-md border border-white/8 bg-white/[0.02] px-3 py-2"
              >
                <span
                  className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}
                >
                  {cfg.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-xs text-white/60">
                    <a
                      href={`/review/${rel.sourceReviewId}`}
                      className="truncate font-medium hover:text-blue-400"
                      title={rel.sourceFileName ?? rel.sourceReviewId}
                    >
                      {rel.sourceFileName ?? rel.sourceReviewId.slice(0, 8)}
                    </a>
                    <span className="shrink-0 text-white/20">&harr;</span>
                    <a
                      href={`/review/${rel.targetReviewId}`}
                      className="truncate font-medium hover:text-blue-400"
                      title={rel.targetFileName ?? rel.targetReviewId}
                    >
                      {rel.targetFileName ?? rel.targetReviewId.slice(0, 8)}
                    </a>
                  </div>
                  {rel.notes && (
                    <p className="mt-0.5 text-[11px] text-white/30">{rel.notes}</p>
                  )}
                  <p className="mt-0.5 text-[10px] text-white/20">
                    {rel.createdByName ? `by ${rel.createdByName} \u00b7 ` : ""}
                    {new Date(rel.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
