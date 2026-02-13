"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  Check,
  AlertCircle,
  RefreshCw,
  Trash2,
  X,
  ArrowUpCircle,
  FileText,
  Search,
} from "lucide-react";

interface FindingPattern {
  id: string;
  patternText: string;
  category: string;
  occurrenceCount: number;
  exampleReviewIds: string[];
  suggestedTemplate: string | null;
  isTemplate: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialPatterns: FindingPattern[];
}

const CATEGORY_COLORS: Record<string, string> = {
  formatting: "bg-violet-500/15 text-violet-400",
  structure: "bg-sky-500/15 text-sky-400",
  citation: "bg-amber-500/15 text-amber-400",
  methodology: "bg-teal-500/15 text-teal-400",
  writing: "bg-pink-500/15 text-pink-400",
  figures: "bg-emerald-500/15 text-emerald-400",
  logic: "bg-indigo-500/15 text-indigo-400",
  completeness: "bg-cyan-500/15 text-cyan-400",
  other: "bg-slate-500/15 text-slate-400",
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] ?? CATEGORY_COLORS.other;
}

export function FindingPatternsDashboard({ initialPatterns }: Props) {
  const [patterns, setPatterns] = useState<FindingPattern[]>(initialPatterns);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState("");

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }, []);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    clearMessages();
    try {
      const res = await fetch("/api/admin/finding-patterns?refresh=true");
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to refresh patterns");
      }
      const { patterns: newPatterns } = await res.json();
      setPatterns(newPatterns);
      showSuccess("Patterns refreshed — analyzed all reviews");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const handlePromote = async (id: string) => {
    if (!templateDraft.trim()) return;
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch("/api/admin/finding-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternId: id, templateText: templateDraft.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to promote pattern");
      }
      const { pattern } = await res.json();
      setPatterns((prev) => prev.map((p) => (p.id === id ? pattern : p)));
      setPromotingId(null);
      setTemplateDraft("");
      showSuccess("Pattern promoted to template");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to promote");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch("/api/admin/finding-patterns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternId: id }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to delete pattern");
      }
      setPatterns((prev) => prev.filter((p) => p.id !== id));
      showSuccess("Pattern deleted");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  };

  // Derive unique categories for filter
  const categories = Array.from(new Set(patterns.map((p) => p.category))).sort();
  const filtered =
    filterCategory === "all"
      ? patterns
      : patterns.filter((p) => p.category === filterCategory);

  return (
    <div>
      {/* Messages */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {success}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {refreshing ? "Analyzing..." : "Refresh Patterns"}
        </button>

        {categories.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-white/30" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60 focus:border-blue-500/30 focus:outline-none"
            >
              <option value="all">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        <span className="text-[10px] text-white/30">
          {filtered.length} pattern{filtered.length !== 1 ? "s" : ""}
          {filterCategory !== "all" && ` in ${filterCategory}`}
        </span>
      </div>

      {/* Empty state */}
      {patterns.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <FileText className="h-8 w-8 text-white/20" />
          <p className="text-xs text-white/40">
            No recurring patterns detected yet. Click &quot;Refresh Patterns&quot; to analyze all
            completed reviews.
          </p>
        </div>
      )}

      {/* Pattern list */}
      <div className="space-y-2">
        {filtered.map((pattern) => (
          <PatternCard
            key={pattern.id}
            pattern={pattern}
            disabled={loading}
            isPromoting={promotingId === pattern.id}
            templateDraft={promotingId === pattern.id ? templateDraft : ""}
            onStartPromote={() => {
              clearMessages();
              setPromotingId(pattern.id);
              setTemplateDraft(pattern.patternText);
            }}
            onCancelPromote={() => {
              setPromotingId(null);
              setTemplateDraft("");
            }}
            onTemplateDraftChange={setTemplateDraft}
            onConfirmPromote={() => handlePromote(pattern.id)}
            onDelete={() => handleDelete(pattern.id)}
          />
        ))}
      </div>
    </div>
  );
}

// -- Pattern Card ──────────────────────────────────────────────────────────────

function PatternCard({
  pattern,
  disabled,
  isPromoting,
  templateDraft,
  onStartPromote,
  onCancelPromote,
  onTemplateDraftChange,
  onConfirmPromote,
  onDelete,
}: {
  pattern: FindingPattern;
  disabled: boolean;
  isPromoting: boolean;
  templateDraft: string;
  onStartPromote: () => void;
  onCancelPromote: () => void;
  onTemplateDraftChange: (val: string) => void;
  onConfirmPromote: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const categoryColor = getCategoryColor(pattern.category);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryColor}`}>
              {pattern.category}
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/50">
              {pattern.occurrenceCount}x
            </span>
            {pattern.isTemplate && (
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                Template
              </span>
            )}
          </div>

          {/* Pattern text */}
          <p className="mt-1.5 text-sm text-white/70">{pattern.patternText}</p>

          {/* Template text if promoted */}
          {pattern.isTemplate && pattern.suggestedTemplate && (
            <div className="mt-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-blue-400/60">Template</p>
              <p className="mt-0.5 text-xs text-blue-300/70">{pattern.suggestedTemplate}</p>
            </div>
          )}

          {/* Example review IDs */}
          {pattern.exampleReviewIds.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-white/25">Reviews:</span>
              {pattern.exampleReviewIds.map((rid) => (
                <a
                  key={rid}
                  href={`/review/${rid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/30 transition-colors hover:bg-white/10 hover:text-white/50"
                >
                  {rid.slice(0, 8)}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {!pattern.isTemplate && (
            <button
              onClick={onStartPromote}
              disabled={disabled || isPromoting}
              className="rounded p-1.5 text-white/30 transition-colors hover:bg-blue-500/10 hover:text-blue-400 disabled:opacity-40"
              aria-label="Promote to template"
              title="Promote to template"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
            </button>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onDelete();
                  setConfirmDelete(false);
                }}
                disabled={disabled}
                className="rounded bg-red-500/20 px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={disabled}
                className="rounded p-1 text-white/30 transition-colors hover:text-white/60 disabled:opacity-40"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={disabled}
              className="rounded p-1.5 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
              aria-label="Delete pattern"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Inline promote form */}
      {isPromoting && (
        <div className="mt-3 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
          <label className="block text-[10px] uppercase tracking-wider text-white/30">
            Template Text
          </label>
          <textarea
            value={templateDraft}
            onChange={(e) => onTemplateDraftChange(e.target.value)}
            rows={3}
            disabled={disabled}
            className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white/80 placeholder-white/20 focus:border-blue-500/30 focus:outline-none disabled:opacity-40"
            placeholder="Edit the template text for reuse..."
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelPromote}
              disabled={disabled}
              className="rounded-md px-3 py-1.5 text-xs text-white/50 transition-colors hover:text-white/70 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={onConfirmPromote}
              disabled={disabled || !templateDraft.trim()}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            >
              {disabled && <Loader2 className="h-3 w-3 animate-spin" />}
              Promote to Template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
