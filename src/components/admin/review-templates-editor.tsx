"use client";

import { useState, useCallback } from "react";
import type { CheckGroupId, ReviewMode } from "@/types/review";
import { ALL_CHECK_GROUP_META, REVIEW_MODES, getCheckGroups } from "@/types/review";
import { Loader2, Check, AlertCircle, Plus, Pencil, Trash2, X } from "lucide-react";

interface ReviewTemplate {
  id: string;
  name: string;
  description: string;
  checkGroups: CheckGroupId[];
  reviewMode: ReviewMode;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialTemplates: ReviewTemplate[];
}

const MODE_LABELS: Record<ReviewMode, string> = {
  proposal: "Proposal",
  thesis: "Thesis",
};

export function ReviewTemplatesEditor({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<ReviewTemplate[]>(initialTemplates);
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

  const handleCreate = async (data: TemplateFormData) => {
    setSaving(true);
    clearMessages();
    try {
      const res = await fetch("/api/admin/review-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create template");
      }
      const { template } = await res.json();
      setTemplates((prev) => [...prev, template]);
      setCreating(false);
      showSuccess("Template created");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, data: TemplateFormData) => {
    setSaving(true);
    clearMessages();
    try {
      const res = await fetch(`/api/admin/review-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update template");
      }
      const { template } = await res.json();
      setTemplates((prev) => prev.map((t) => (t.id === id ? template : t)));
      setEditing(null);
      showSuccess("Template updated");
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
      const res = await fetch(`/api/admin/review-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to delete template");
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      showSuccess("Template deleted");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

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

      <div className="space-y-3">
        {templates.map((t) =>
          editing === t.id ? (
            <TemplateForm
              key={t.id}
              initial={t}
              saving={saving}
              onSave={(data) => handleUpdate(t.id, data)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <TemplateCard
              key={t.id}
              template={t}
              disabled={saving}
              onEdit={() => { clearMessages(); setEditing(t.id); }}
              onDelete={() => handleDelete(t.id)}
            />
          )
        )}
      </div>

      {creating ? (
        <div className="mt-3">
          <TemplateForm
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
          Add Template
        </button>
      )}
    </div>
  );
}

// ── Template Card ──────────────────────────────────────────────────────────

function TemplateCard({
  template,
  disabled,
  onEdit,
  onDelete,
}: {
  template: ReviewTemplate;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white/80">{template.name}</span>
            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">
              {MODE_LABELS[template.reviewMode]}
            </span>
          </div>
          {template.description && (
            <p className="mt-0.5 text-xs text-white/40">{template.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {template.checkGroups.map((gid) => (
              <span
                key={gid}
                className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40"
              >
                {ALL_CHECK_GROUP_META[gid]?.label ?? gid}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onEdit}
            disabled={disabled}
            className="rounded p-1.5 text-white/30 transition-colors hover:bg-white/5 hover:text-white/60 disabled:opacity-40"
            aria-label={`Edit ${template.name}`}
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
              aria-label={`Delete ${template.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Template Form ──────────────────────────────────────────────────────────

interface TemplateFormData {
  name: string;
  description: string;
  checkGroups: CheckGroupId[];
  reviewMode: ReviewMode;
}

function TemplateForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: ReviewTemplate;
  saving: boolean;
  onSave: (data: TemplateFormData) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [reviewMode, setReviewMode] = useState<ReviewMode>(initial?.reviewMode ?? "proposal");
  const [selectedGroups, setSelectedGroups] = useState<Set<CheckGroupId>>(
    () => new Set(initial?.checkGroups ?? getCheckGroups("proposal").map((g) => g.id))
  );

  const modeGroups = getCheckGroups(reviewMode);

  const handleModeChange = (mode: ReviewMode) => {
    setReviewMode(mode);
    // Reset to all groups for the new mode
    setSelectedGroups(new Set(getCheckGroups(mode).map((g) => g.id)));
  };

  const toggleGroup = (gid: CheckGroupId) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedGroups.size === 0) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      checkGroups: [...selectedGroups],
      reviewMode,
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
            placeholder="Template name"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            disabled={saving}
            className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white/80 placeholder-white/20 focus:border-blue-500/30 focus:outline-none disabled:opacity-40"
            placeholder="Optional description"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Review Mode</label>
        <div className="flex gap-2">
          {REVIEW_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              disabled={saving}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                reviewMode === m
                  ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20"
              } disabled:opacity-40`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wider text-white/30">
            Check Groups ({selectedGroups.size}/{modeGroups.length})
          </label>
          <button
            type="button"
            onClick={() => {
              const allIds = modeGroups.map((g) => g.id);
              setSelectedGroups((prev) =>
                prev.size === allIds.length ? new Set<CheckGroupId>() : new Set(allIds)
              );
            }}
            disabled={saving}
            className="text-[10px] text-blue-400/70 hover:text-blue-400 disabled:opacity-40"
          >
            {selectedGroups.size === modeGroups.length ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {modeGroups.map((g) => {
            const checked = selectedGroups.has(g.id);
            return (
              <label
                key={g.id}
                className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                  checked ? "bg-white/[0.04] text-white/70" : "text-white/30"
                } ${saving ? "pointer-events-none opacity-40" : "hover:bg-white/[0.06]"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleGroup(g.id)}
                  disabled={saving}
                  className="sr-only"
                />
                <div className={`h-3.5 w-6 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-white/10"}`}>
                  <div className={`mt-[1px] ml-[2px] h-2.5 w-2.5 rounded-full bg-white transition-transform ${checked ? "translate-x-2.5" : "translate-x-0"}`} />
                </div>
                <span className="truncate">{g.label}</span>
              </label>
            );
          })}
        </div>
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
          disabled={saving || !name.trim() || selectedGroups.size === 0}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {initial ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}
