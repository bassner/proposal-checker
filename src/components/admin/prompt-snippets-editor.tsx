"use client";

import { useState, useCallback } from "react";
import { Loader2, Check, AlertCircle, Plus, Pencil, Trash2, X, Code, Puzzle } from "lucide-react";
import { SNIPPET_CATEGORIES } from "@/lib/validation/admin";

type SnippetCategory = (typeof SNIPPET_CATEGORIES)[number];

interface PromptSnippet {
  id: string;
  name: string;
  content: string;
  category: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialSnippets: PromptSnippet[];
}

const CATEGORY_COLORS: Record<SnippetCategory, string> = {
  Quality: "bg-green-500/15 text-green-400",
  Style: "bg-purple-500/15 text-purple-400",
  Academic: "bg-blue-500/15 text-blue-400",
  Compliance: "bg-amber-500/15 text-amber-400",
  Custom: "bg-slate-500/15 text-slate-400",
};

export function PromptSnippetsEditor({ initialSnippets }: Props) {
  const [snippets, setSnippets] = useState<PromptSnippet[]>(initialSnippets);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const handleCreate = async (data: SnippetFormData) => {
    setSaving(true);
    clearMessages();
    try {
      const res = await fetch("/api/admin/prompt-snippets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create snippet");
      }
      const { snippet } = await res.json();
      setSnippets((prev) => [...prev, snippet]);
      setCreating(false);
      showSuccess("Snippet created");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, data: SnippetFormData) => {
    setSaving(true);
    clearMessages();
    try {
      const res = await fetch(`/api/admin/prompt-snippets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update snippet");
      }
      const { snippet } = await res.json();
      setSnippets((prev) => prev.map((s) => (s.id === id ? snippet : s)));
      setEditing(null);
      showSuccess("Snippet updated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    clearMessages();
    try {
      const res = await fetch(`/api/admin/prompt-snippets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to delete snippet");
      }
      setSnippets((prev) => prev.filter((s) => s.id !== id));
      showSuccess("Snippet deleted");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  // Group snippets by category
  const grouped = snippets.reduce<Record<string, PromptSnippet[]>>((acc, snippet) => {
    const cat = snippet.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(snippet);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort();

  return (
    <div>
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

      {snippets.length === 0 && !creating && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Puzzle className="h-8 w-8 text-white/20" />
          <p className="text-xs text-white/40">No prompt snippets yet. Create one to get started.</p>
        </div>
      )}

      <div className="space-y-4">
        {sortedCategories.map((category) => (
          <div key={category}>
            <div className="mb-2 flex items-center gap-2">
              <Code className="h-3.5 w-3.5 text-white/30" />
              <h3 className="text-xs font-medium text-white/50">{category}</h3>
              <span className="text-[10px] text-white/20">
                ({grouped[category].length})
              </span>
            </div>
            <div className="space-y-2">
              {grouped[category].map((snippet) =>
                editing === snippet.id ? (
                  <SnippetForm
                    key={snippet.id}
                    initial={snippet}
                    saving={saving}
                    onSave={(data) => handleUpdate(snippet.id, data)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <SnippetCard
                    key={snippet.id}
                    snippet={snippet}
                    disabled={saving}
                    onEdit={() => { clearMessages(); setEditing(snippet.id); }}
                    onDelete={() => handleDelete(snippet.id)}
                  />
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {creating ? (
        <div className="mt-3">
          <SnippetForm
            saving={saving}
            onSave={handleCreate}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => { clearMessages(); setCreating(true); }}
          disabled={saving}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-3 py-2 text-xs text-white/50 transition-colors hover:border-white/30 hover:text-white/70 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Snippet
        </button>
      )}
    </div>
  );
}

// -- Snippet Card ────────────────────────────────────────────────────────────

function SnippetCard({
  snippet,
  disabled,
  onEdit,
  onDelete,
}: {
  snippet: PromptSnippet;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const categoryColor =
    CATEGORY_COLORS[snippet.category as SnippetCategory] ?? CATEGORY_COLORS.Custom;

  const preview =
    snippet.content.length > 100
      ? snippet.content.slice(0, 100) + "..."
      : snippet.content;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white/80">{snippet.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryColor}`}>
              {snippet.category}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-white/35">
            {preview}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onEdit}
            disabled={disabled}
            className="rounded p-1.5 text-white/30 transition-colors hover:bg-white/5 hover:text-white/60 disabled:opacity-40"
            aria-label={`Edit ${snippet.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
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
              aria-label={`Delete ${snippet.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Snippet Form ────────────────────────────────────────────────────────────

interface SnippetFormData {
  name: string;
  content: string;
  category: string;
}

function SnippetForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: PromptSnippet;
  saving: boolean;
  onSave: (data: SnippetFormData) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState<string>(initial?.category ?? SNIPPET_CATEGORIES[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    onSave({
      name: name.trim(),
      content: content.trim(),
      category,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            disabled={saving}
            className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white/80 placeholder-white/20 focus:border-blue-500/30 focus:outline-none disabled:opacity-40"
            placeholder="Snippet name"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {SNIPPET_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                disabled={saving}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  category === cat
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                    : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20"
                } disabled:opacity-40`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={10000}
          required
          disabled={saving}
          rows={5}
          className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-sm text-white/80 placeholder-white/20 focus:border-blue-500/30 focus:outline-none disabled:opacity-40"
          placeholder="Enter prompt fragment content..."
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-xs text-white/50 transition-colors hover:text-white/70 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim() || !content.trim()}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {initial ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}
