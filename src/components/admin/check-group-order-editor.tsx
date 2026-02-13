"use client";

import { useState, useCallback } from "react";
import { GripVertical, ArrowUp, ArrowDown, Save, Loader2, Check, AlertCircle } from "lucide-react";
import type { CheckGroupOrderRow } from "@/lib/db";
import { ALL_CHECK_GROUP_META } from "@/types/review";
import type { CheckGroupId } from "@/types/review";
import { cn } from "@/lib/utils";

interface Props {
  initialOrder: CheckGroupOrderRow[];
}

export function CheckGroupOrderEditor({ initialOrder }: Props) {
  const [items, setItems] = useState<CheckGroupOrderRow[]>(initialOrder);
  const [savedOrder, setSavedOrder] = useState<CheckGroupOrderRow[]>(initialOrder);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const hasChanges = items.some(
    (item, i) => item.checkGroup !== savedOrder[i]?.checkGroup
  );

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((item, i) => ({ ...item, displayOrder: i }));
    });
  }, [items.length]);

  const handleSave = async () => {
    if (saving || !hasChanges) return;

    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      const res = await fetch("/api/admin/check-group-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: items.map((item, i) => ({
            checkGroup: item.checkGroup,
            displayOrder: i,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Update failed");
      }

      const { order: updated } = await res.json();
      setItems(updated);
      setSavedOrder(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      moveItem(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-white/35">
        Drag and drop or use arrow buttons to reorder how check groups appear in review results.
      </p>

      <div className="space-y-1">
        {items.map((item, index) => {
          const meta = ALL_CHECK_GROUP_META[item.checkGroup as CheckGroupId];
          const label = meta?.label ?? item.checkGroup;
          const isDragging = dragIndex === index;
          const isDragOver = dragOverIndex === index;

          return (
            <div
              key={item.checkGroup}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                isDragging
                  ? "border-blue-500/40 bg-blue-500/10 opacity-50"
                  : isDragOver
                    ? "border-blue-500/30 bg-blue-500/5"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20",
              )}
            >
              {/* Drag handle */}
              <div
                className="cursor-grab text-slate-300 active:cursor-grabbing dark:text-white/20"
                aria-hidden="true"
              >
                <GripVertical className="h-4 w-4" />
              </div>

              {/* Position number */}
              <span className="w-6 text-center text-xs font-bold tabular-nums text-slate-400 dark:text-white/30">
                {index + 1}
              </span>

              {/* Label */}
              <span className="flex-1 text-sm font-medium text-slate-700 dark:text-white/70">
                {label}
              </span>

              {/* Up/Down buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveItem(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${label} up`}
                  className={cn(
                    "rounded-md p-1 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 dark:focus-visible:ring-white/40",
                    index === 0
                      ? "text-slate-200 dark:text-white/10 cursor-not-allowed"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-white/30 dark:hover:bg-white/10 dark:hover:text-white/60",
                  )}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(index, index + 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${label} down`}
                  className={cn(
                    "rounded-md p-1 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 dark:focus-visible:ring-white/40",
                    index === items.length - 1
                      ? "text-slate-200 dark:text-white/10 cursor-not-allowed"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-white/30 dark:hover:bg-white/10 dark:hover:text-white/60",
                  )}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            hasChanges
              ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              : "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-white/20 cursor-not-allowed",
            saving && "opacity-50",
          )}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save Order
        </button>
        {success && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
