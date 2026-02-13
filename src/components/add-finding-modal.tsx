"use client";

import { useState, useRef, useEffect } from "react";
import type { Severity, FindingCategory } from "@/types/review";
import { FINDING_CATEGORY_VALUES, FINDING_CATEGORIES } from "@/types/review";
import { cn } from "@/lib/utils";
import { X, Plus, Loader2 } from "lucide-react";

const SEVERITY_OPTIONS: { value: Severity; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "text-red-400" },
  { value: "major", label: "Major", color: "text-orange-400" },
  { value: "minor", label: "Minor", color: "text-yellow-400" },
  { value: "suggestion", label: "Suggestion", color: "text-blue-400" },
];

interface AddFindingModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (finding: {
    severity: Severity;
    category: string;
    title: string;
    description: string;
    locations: { page: number | null; section: string | null; quote: string }[];
  }) => Promise<void>;
}

export function AddFindingModal({ open, onClose, onSubmit }: AddFindingModalProps) {
  const [severity, setSeverity] = useState<Severity>("minor");
  const [category, setCategory] = useState<FindingCategory>("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [page, setPage] = useState("");
  const [section, setSection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const reset = () => {
    setSeverity("minor");
    setCategory("other");
    setTitle("");
    setDescription("");
    setPage("");
    setSection("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        severity,
        category,
        title: title.trim(),
        description: description.trim(),
        locations: page
          ? [{ page: parseInt(page, 10) || null, section: section.trim() || null, quote: "" }]
          : [],
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add finding");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Add finding">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative mx-4 w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-white/80">Add Manual Finding</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/30 hover:text-white/60 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {/* Severity + Category row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/40">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 focus:border-white/20 focus:outline-none"
              >
                {SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/40">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FindingCategory)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 focus:border-white/20 focus:outline-none"
              >
                {FINDING_CATEGORY_VALUES.map((cat) => (
                  <option key={cat} value={cat}>{FINDING_CATEGORIES[cat].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/40">Title</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief title for the finding..."
              maxLength={500}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/40">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the issue..."
              rows={3}
              maxLength={5000}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:border-white/20 focus:outline-none resize-none"
            />
          </div>

          {/* Location (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                Page <span className="normal-case text-white/20">(optional)</span>
              </label>
              <input
                type="number"
                value={page}
                onChange={(e) => setPage(e.target.value)}
                placeholder="e.g. 3"
                min={1}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:border-white/20 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/40">
                Section <span className="normal-case text-white/20">(optional)</span>
              </label>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. Introduction"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:border-white/20 focus:outline-none"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white/40 transition-colors hover:text-white/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !description.trim()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add Finding
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
