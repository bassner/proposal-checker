"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Link2, Plus, X, Search, Loader2, AlertCircle } from "lucide-react";

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
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  sourceFileName: string | null;
  targetFileName: string | null;
  sourceUserName: string | null;
  targetUserName: string | null;
}

interface ReviewCandidate {
  id: string;
  fileName: string | null;
  userName: string;
  createdAt: string;
}

interface ProposalRelationshipsProps {
  reviewId: string;
  editable?: boolean;
}

// ---------------------------------------------------------------------------
// Relationship type config (labels + badge colors)
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

const RELATIONSHIP_TYPES = Object.keys(TYPE_CONFIG) as RelationshipType[];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProposalRelationships({
  reviewId,
  editable = true,
}: ProposalRelationshipsProps) {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Add form state
  const [searchQuery, setSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<ReviewCandidate | null>(null);
  const [selectedType, setSelectedType] = useState<RelationshipType>("related");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const formRef = useRef<HTMLDivElement>(null);

  const fetchRelationships = useCallback(async () => {
    try {
      const res = await fetch(`/api/review/${reviewId}/relationships`);
      if (!res.ok) {
        setError("Failed to load relationships");
        return;
      }
      const data = await res.json();
      setRelationships(data.relationships ?? []);
    } catch {
      setError("Failed to load relationships");
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    fetchRelationships();
  }, [fetchRelationships]);

  // Debounced search for candidates
  useEffect(() => {
    if (!adding) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim()) {
      setCandidates([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/review/${reviewId}/relationships?search=${encodeURIComponent(searchQuery)}`
        );
        if (res.ok) {
          const data = await res.json();
          setCandidates(data.candidates ?? []);
        }
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, adding, reviewId]);

  const handleSubmit = useCallback(async () => {
    if (!selectedTarget || submitting) return;
    setFormError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/review/${reviewId}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetReviewId: selectedTarget.id,
          relationshipType: selectedType,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || "Failed to create relationship");
        return;
      }

      const data = await res.json();
      setRelationships(data.relationships ?? []);
      resetForm();
    } catch {
      setFormError("Failed to create relationship");
    } finally {
      setSubmitting(false);
    }
  }, [reviewId, selectedTarget, selectedType, notes, submitting]);

  const handleDelete = useCallback(
    async (relationshipId: string) => {
      // Optimistic removal
      setRelationships((prev) => prev.filter((r) => r.id !== relationshipId));

      try {
        const res = await fetch(`/api/review/${reviewId}/relationships`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relationshipId }),
        });

        if (res.ok) {
          const data = await res.json();
          setRelationships(data.relationships ?? []);
        } else {
          // Revert on error
          fetchRelationships();
        }
      } catch {
        fetchRelationships();
      }
    },
    [reviewId, fetchRelationships]
  );

  function resetForm() {
    setAdding(false);
    setSearchQuery("");
    setCandidates([]);
    setSelectedTarget(null);
    setSelectedType("related");
    setNotes("");
    setFormError(null);
  }

  /**
   * For a given relationship, resolve the "other" review's display info.
   * If this review is the source, show target info, and vice versa.
   */
  function getOtherSide(rel: Relationship) {
    if (rel.sourceReviewId === reviewId) {
      return {
        reviewId: rel.targetReviewId,
        fileName: rel.targetFileName,
        userName: rel.targetUserName,
      };
    }
    return {
      reviewId: rel.sourceReviewId,
      fileName: rel.sourceFileName,
      userName: rel.sourceUserName,
    };
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-white/40">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading relationships...
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

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-white/50">
          <Link2 className="h-3.5 w-3.5" />
          Related Proposals
          {relationships.length > 0 && (
            <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums dark:bg-white/10">
              {relationships.length}
            </span>
          )}
        </div>
        {editable && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white/70"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
      </div>

      {/* Relationship list */}
      {relationships.length === 0 && !adding && (
        <p className="py-2 text-center text-[11px] text-slate-400 dark:text-white/25">
          No related proposals yet.
        </p>
      )}

      {relationships.length > 0 && (
        <div className="space-y-1.5">
          {relationships.map((rel) => {
            const other = getOtherSide(rel);
            const cfg = TYPE_CONFIG[rel.relationshipType];
            return (
              <div
                key={rel.id}
                className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/8 dark:bg-white/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}
                    >
                      {cfg.label}
                    </span>
                    <a
                      href={`/review/${other.reviewId}`}
                      className="truncate text-xs font-medium text-slate-700 hover:text-blue-600 dark:text-white/70 dark:hover:text-blue-400"
                      title={other.fileName ?? other.reviewId}
                    >
                      {other.fileName ?? other.reviewId.slice(0, 8)}
                    </a>
                  </div>
                  {other.userName && (
                    <p className="mt-0.5 text-[10px] text-slate-400 dark:text-white/30">
                      by {other.userName}
                    </p>
                  )}
                  {rel.notes && (
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-white/40">
                      {rel.notes}
                    </p>
                  )}
                </div>
                {editable && (
                  <button
                    onClick={() => handleDelete(rel.id)}
                    className="shrink-0 rounded p-0.5 text-slate-300 transition-colors hover:text-red-500 dark:text-white/15 dark:hover:text-red-400"
                    aria-label="Remove relationship"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add relationship form */}
      {editable && adding && (
        <div
          ref={formRef}
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.02]"
        >
          {/* Search target review */}
          {!selectedTarget ? (
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-500 dark:text-white/40">
                Search for a review to link
              </label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-white/30" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by file name, user..."
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-3 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:border-blue-500/50"
                  autoFocus
                />
                {searching && (
                  <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400 dark:text-white/30" />
                )}
              </div>

              {/* Candidate results */}
              {candidates.length > 0 && (
                <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedTarget(c);
                        setSearchQuery("");
                        setCandidates([]);
                      }}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:text-white/60 dark:hover:bg-white/5"
                    >
                      <span className="truncate font-medium">
                        {c.fileName ?? c.id.slice(0, 8)}
                      </span>
                      <span className="ml-2 shrink-0 text-[10px] text-slate-400 dark:text-white/30">
                        {c.userName}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.trim() && !searching && candidates.length === 0 && (
                <p className="text-[10px] text-slate-400 dark:text-white/25">
                  No matching reviews found.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Selected target display */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-500 dark:text-white/40">
                  Linking to:
                </span>
                <span className="truncate text-xs font-medium text-slate-700 dark:text-white/70">
                  {selectedTarget.fileName ?? selectedTarget.id.slice(0, 8)}
                </span>
                <button
                  onClick={() => setSelectedTarget(null)}
                  className="shrink-0 text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Relationship type selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-500 dark:text-white/40">
                  Relationship type
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {RELATIONSHIP_TYPES.map((type) => {
                    const cfg = TYPE_CONFIG[type];
                    const isSelected = selectedType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all ${
                          isSelected
                            ? `${cfg.bg} ${cfg.text} ${cfg.border} ring-1 ring-current/20`
                            : "border-slate-200 text-slate-400 hover:border-slate-300 dark:border-white/10 dark:text-white/30 dark:hover:border-white/20"
                        }`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional notes */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-500 dark:text-white/40">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why are these related?"
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:border-blue-500/50"
                />
              </div>

              {formError && (
                <p className="text-[11px] text-red-500">{formError}</p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                  Add Relationship
                </button>
                <button
                  onClick={resetForm}
                  className="rounded-md px-3 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-white/40 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
