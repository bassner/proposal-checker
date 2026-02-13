"use client";

import { useState, useCallback } from "react";
import { Trash2, Tag, Download, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BulkActionsBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

export function BulkActionsBar({
  selectedIds,
  onClearSelection,
  onActionComplete,
}: BulkActionsBarProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tagMode, setTagMode] = useState<"add" | "remove" | null>(null);
  const [tagInput, setTagInput] = useState("");

  const count = selectedIds.length;

  const performAction = useCallback(
    async (action: string, extras?: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/bulk-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reviewIds: selectedIds, ...extras }),
        });

        if (action === "export" && res.ok) {
          // Trigger CSV download
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download =
            res.headers
              .get("Content-Disposition")
              ?.match(/filename="(.+)"/)?.[1] ?? "reviews-export.csv";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Action failed");
          setLoading(false);
          return;
        }

        onClearSelection();
        onActionComplete();
      } catch {
        setError("Action failed");
      } finally {
        setLoading(false);
      }
    },
    [selectedIds, onClearSelection, onActionComplete]
  );

  const handleDelete = useCallback(() => {
    setDeleteOpen(false);
    performAction("delete");
  }, [performAction]);

  const handleTagSubmit = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    const action = tagMode === "add" ? "add_tag" : "remove_tag";
    performAction(action, { tag });
    setTagMode(null);
    setTagInput("");
  }, [tagInput, tagMode, performAction]);

  const handleExport = useCallback(() => {
    performAction("export");
  }, [performAction]);

  if (count === 0) return null;

  return (
    <>
      {/* Floating bar */}
      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-200">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {/* Count */}
          <span className="text-sm font-medium text-slate-700 dark:text-white/80">
            {count} selected
          </span>

          <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />

          {/* Tag actions */}
          {tagMode ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTagSubmit();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder={tagMode === "add" ? "Enter tag..." : "Tag to remove..."}
                className="w-36 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30 dark:focus:border-blue-500/50"
                autoFocus
                disabled={loading}
              />
              <Button
                type="submit"
                size="sm"
                disabled={loading || !tagInput.trim()}
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  tagMode === "add" ? "Add" : "Remove"
                )}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setTagMode(null);
                  setTagInput("");
                }}
                className="text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10"
                onClick={() => setTagMode("add")}
                disabled={loading}
              >
                <Tag className="mr-1.5 h-3.5 w-3.5" />
                Add Tag
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10"
                onClick={() => setTagMode("remove")}
                disabled={loading}
              >
                <Tag className="mr-1.5 h-3.5 w-3.5" />
                Remove Tag
              </Button>

              <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />

              <Button
                variant="outline"
                size="sm"
                className="border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10"
                onClick={handleExport}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                Export CSV
              </Button>

              <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />

              <Button
                variant="outline"
                size="sm"
                className="border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10"
                onClick={() => setDeleteOpen(true)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Delete
              </Button>
            </>
          )}

          <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />

          {/* Clear selection */}
          <button
            onClick={onClearSelection}
            className="text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
            title="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Error */}
          {error && (
            <span className="text-xs text-red-400">{error}</span>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count} Review{count !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {count} selected review{count !== 1 ? "s" : ""}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-600/20"
            >
              Delete {count} Review{count !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
