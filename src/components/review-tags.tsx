"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Tag, Plus, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Deterministic color from tag name (consistent across renders)
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TagData {
  id: string;
  reviewId: string;
  tag: string;
  createdBy: string;
  createdAt: string;
}

interface PopularTag {
  tag: string;
  count: number;
}

interface ReviewTagsProps {
  reviewId: string;
  /** Compact mode for reviews list (smaller chips, no add button inline). */
  compact?: boolean;
  /** If true, user can add/remove tags. */
  editable?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewTags({ reviewId, compact = false, editable = true }: ReviewTagsProps) {
  const [tags, setTags] = useState<TagData[]>([]);
  const [popularTags, setPopularTags] = useState<PopularTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch(`/api/review/${reviewId}/tags?popular=true`);
      if (!res.ok) return;
      const data = await res.json();
      setTags(data.tags ?? []);
      setPopularTags(data.popularTags ?? []);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        if (!inputValue.trim()) setAdding(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [inputValue]);

  const handleAdd = useCallback(
    async (tagName: string) => {
      const normalized = tagName.trim().toLowerCase();
      if (!normalized || submitting) return;
      // Already exists
      if (tags.some((t) => t.tag === normalized)) {
        setInputValue("");
        setShowSuggestions(false);
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch(`/api/review/${reviewId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: normalized }),
        });
        if (res.ok) {
          const data = await res.json();
          setTags(data.tags ?? []);
        }
      } catch {
        // silent fail
      } finally {
        setSubmitting(false);
        setInputValue("");
        setShowSuggestions(false);
      }
    },
    [reviewId, tags, submitting]
  );

  const handleRemove = useCallback(
    async (tagName: string) => {
      if (submitting) return;
      // Optimistic removal
      setTags((prev) => prev.filter((t) => t.tag !== tagName));
      try {
        const res = await fetch(`/api/review/${reviewId}/tags`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: tagName }),
        });
        if (res.ok) {
          const data = await res.json();
          setTags(data.tags ?? []);
        }
      } catch {
        // Refetch to fix state
        fetchTags();
      }
    },
    [reviewId, submitting, fetchTags]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd(inputValue);
      } else if (e.key === "Escape") {
        setAdding(false);
        setInputValue("");
        setShowSuggestions(false);
      }
    },
    [inputValue, handleAdd]
  );

  // Filter suggestions: popular tags not already added, matching input
  const suggestions = popularTags
    .filter(
      (pt) =>
        !tags.some((t) => t.tag === pt.tag) &&
        pt.tag.includes(inputValue.toLowerCase())
    )
    .slice(0, 8);

  if (loading) return null;

  // Compact mode: just show tag pills (no add button)
  if (compact) {
    if (tags.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => {
          const color = hashTagColor(t.tag);
          return (
            <span
              key={t.id}
              className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[10px] font-medium ${color.bg} ${color.text} ${color.border}`}
            >
              {t.tag}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-1.5">
      <Tag className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/30" />

      {tags.map((t) => {
        const color = hashTagColor(t.tag);
        return (
          <span
            key={t.id}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${color.bg} ${color.text} ${color.border}`}
          >
            {t.tag}
            {editable && (
              <button
                onClick={() => handleRemove(t.tag)}
                className="ml-0.5 rounded-full p-0 opacity-60 transition-opacity hover:opacity-100"
                aria-label={`Remove tag ${t.tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}

      {editable && !adding && (
        <button
          onClick={() => {
            setAdding(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-600 dark:border-white/15 dark:text-white/30 dark:hover:border-white/30 dark:hover:text-white/60"
        >
          <Plus className="h-3 w-3" />
          Add tag
        </button>
      )}

      {editable && adding && (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder="Type tag..."
            className="h-6 w-28 rounded-full border border-slate-300 bg-white px-2 text-[11px] text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:border-blue-500/50"
            disabled={submitting}
          />

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
              {suggestions.map((s) => (
                <button
                  key={s.tag}
                  onClick={() => handleAdd(s.tag)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] text-slate-600 transition-colors hover:bg-slate-50 dark:text-white/60 dark:hover:bg-white/5"
                >
                  <span>{s.tag}</span>
                  <span className="text-[10px] text-slate-400 dark:text-white/30">
                    {s.count}x
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tags.length === 0 && !adding && !editable && (
        <span className="text-[11px] text-slate-400 dark:text-white/30">No tags</span>
      )}
    </div>
  );
}
