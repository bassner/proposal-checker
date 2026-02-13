"use client";

import { useState, useCallback } from "react";
import { Loader2, Check, AlertCircle, RotateCcw, Save, FileText, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import type { CheckGroupId } from "@/types/review";
import { ALL_CHECK_GROUP_META } from "@/types/review";

interface CustomPrompt {
  checkGroup: string;
  systemPrompt: string;
  updatedBy: string;
  updatedAt: string;
  isActive: boolean;
}

interface Props {
  initialCustomPrompts: CustomPrompt[];
  defaultPrompts: Record<string, string>;
}

export function CustomPromptsEditor({ initialCustomPrompts, defaultPrompts }: Props) {
  const [customPrompts, setCustomPrompts] = useState<Record<string, CustomPrompt>>(
    Object.fromEntries(initialCustomPrompts.map((p) => [p.checkGroup, p]))
  );
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }, []);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  }, []);

  const allGroups = Object.keys(ALL_CHECK_GROUP_META) as CheckGroupId[];

  const handleExpand = (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      setEditingGroup(null);
    } else {
      setExpandedGroup(groupId);
      setEditingGroup(null);
    }
  };

  const handleStartEdit = (groupId: string) => {
    const custom = customPrompts[groupId];
    setEditBuffer(custom?.systemPrompt ?? defaultPrompts[groupId] ?? "");
    setEditingGroup(groupId);
  };

  const handleCancelEdit = () => {
    setEditingGroup(null);
    setEditBuffer("");
  };

  const handleSave = async (groupId: string) => {
    if (!editBuffer.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/custom-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkGroup: groupId, systemPrompt: editBuffer.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to save");
      }
      const { prompt } = await res.json();
      setCustomPrompts((prev) => ({ ...prev, [groupId]: prompt }));
      setEditingGroup(null);
      showSuccess(`Prompt saved for ${ALL_CHECK_GROUP_META[groupId as CheckGroupId]?.label ?? groupId}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (groupId: string) => {
    const current = customPrompts[groupId];
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/custom-prompts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkGroup: groupId, isActive: !current.isActive }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to toggle");
      }
      const { prompt } = await res.json();
      setCustomPrompts((prev) => ({ ...prev, [groupId]: prompt }));
      showSuccess(`${prompt.isActive ? "Activated" : "Deactivated"} custom prompt`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to toggle");
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async (groupId: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/custom-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkGroup: groupId }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to reset");
      }
      setCustomPrompts((prev) => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
      setEditingGroup(null);
      showSuccess(`Reset to default for ${ALL_CHECK_GROUP_META[groupId as CheckGroupId]?.label ?? groupId}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to reset");
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

      <div className="space-y-2">
        {allGroups.map((groupId) => {
          const meta = ALL_CHECK_GROUP_META[groupId];
          const custom = customPrompts[groupId];
          const isExpanded = expandedGroup === groupId;
          const isEditing = editingGroup === groupId;
          const hasCustom = !!custom;
          const isActive = custom?.isActive ?? false;
          const effectivePrompt = hasCustom && isActive ? custom.systemPrompt : defaultPrompts[groupId];

          return (
            <div
              key={groupId}
              className="rounded-lg border border-white/10 bg-white/[0.03]"
            >
              {/* Header row */}
              <button
                type="button"
                onClick={() => handleExpand(groupId)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-white/30" />
                <span className="flex-1 text-sm font-medium text-white/80">
                  {meta.label}
                </span>
                {hasCustom ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      isActive
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {isActive ? "Custom" : "Custom (inactive)"}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                    Default
                  </span>
                )}
                <svg
                  className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-white/10 px-3 py-3">
                  {/* Action buttons */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {!isEditing && (
                      <button
                        onClick={() => handleStartEdit(groupId)}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
                      >
                        <Pencil className="h-3 w-3" />
                        {hasCustom ? "Edit Override" : "Create Override"}
                      </button>
                    )}
                    {hasCustom && !isEditing && (
                      <>
                        <button
                          onClick={() => handleToggleActive(groupId)}
                          disabled={saving}
                          className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-40"
                        >
                          {isActive ? (
                            <ToggleRight className="h-3.5 w-3.5 text-blue-400" />
                          ) : (
                            <ToggleLeft className="h-3.5 w-3.5 text-white/30" />
                          )}
                          {isActive ? "Active" : "Inactive"}
                        </button>
                        <button
                          onClick={() => handleResetToDefault(groupId)}
                          disabled={saving}
                          className="flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-400 transition-colors hover:border-red-500/30 hover:bg-red-500/10 disabled:opacity-40"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reset to Default
                        </button>
                      </>
                    )}
                  </div>

                  {isEditing ? (
                    /* Editing mode */
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">
                          System Prompt Override
                        </label>
                        <textarea
                          value={editBuffer}
                          onChange={(e) => setEditBuffer(e.target.value)}
                          disabled={saving}
                          rows={16}
                          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs leading-relaxed text-white/80 placeholder-white/20 focus:border-blue-500/30 focus:outline-none disabled:opacity-40"
                          placeholder="Enter custom system prompt..."
                        />
                        <p className="mt-1 text-[10px] text-white/25">
                          {editBuffer.length.toLocaleString()} characters
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          disabled={saving}
                          className="rounded-md px-3 py-1.5 text-xs text-white/50 transition-colors hover:text-white/70 disabled:opacity-40"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSave(groupId)}
                          disabled={saving || !editBuffer.trim()}
                          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
                        >
                          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                          <Save className="h-3 w-3" />
                          Save Override
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Read-only view */
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">
                        {hasCustom && isActive ? "Active Custom Prompt" : hasCustom ? "Custom Prompt (inactive — using default)" : "Default Prompt"}
                      </label>
                      <div className="max-h-64 overflow-y-auto rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
                        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-white/50">
                          {effectivePrompt ?? "(no prompt found)"}
                        </pre>
                      </div>
                      {hasCustom && !isActive && (
                        <div className="mt-2">
                          <label className="mb-1 block text-[10px] uppercase tracking-wider text-amber-400/50">
                            Inactive Custom Override
                          </label>
                          <div className="max-h-32 overflow-y-auto rounded-md border border-amber-500/10 bg-amber-500/5 px-3 py-2">
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-amber-400/40">
                              {custom.systemPrompt.length > 200
                                ? custom.systemPrompt.slice(0, 200) + "..."
                                : custom.systemPrompt}
                            </pre>
                          </div>
                        </div>
                      )}
                      {custom?.updatedAt && (
                        <p className="mt-2 text-[10px] text-white/20">
                          Last updated: {new Date(custom.updatedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
