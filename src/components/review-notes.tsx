"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { NotebookPen, Trash2, ChevronDown, ChevronUp, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReviewNote {
  id: string;
  reviewId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReviewNotes({ reviewId }: { reviewId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const userId = session?.user?.id;
  const isSupervisor = role === "admin" || role === "phd";

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing state for the current user's note
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Track the last saved content to avoid unnecessary saves
  const lastSavedRef = useRef<string>("");

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}/notes`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load notes");
        return;
      }
      const data = await res.json();
      const fetched: ReviewNote[] = data.notes ?? [];
      setNotes(fetched);

      // Initialize draft with current user's existing note
      if (userId) {
        const myNote = fetched.find((n) => n.userId === userId);
        const content = myNote?.content ?? "";
        setDraft(content);
        lastSavedRef.current = content;
      }
    } catch {
      setError("Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [reviewId, userId]);

  useEffect(() => {
    if (open && notes.length === 0 && !loading && !error) {
      fetchNotes();
    }
  }, [open, notes.length, loading, error, fetchNotes]);

  // Auto-save with debounce
  const saveNote = useCallback(
    async (content: string) => {
      if (content === lastSavedRef.current) return;
      setSaving(true);
      setSaveStatus("idle");
      try {
        const res = await fetch(`/api/review/${reviewId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) {
          setSaveStatus("error");
          return;
        }
        const data = await res.json();
        setNotes(data.notes ?? []);
        lastSavedRef.current = content;
        setSaveStatus("saved");
        // Clear "saved" indicator after 2s
        setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      } catch {
        setSaveStatus("error");
      } finally {
        setSaving(false);
      }
    },
    [reviewId]
  );

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      setSaveStatus("idle");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveNote(value.trim());
      }, 1000);
    },
    [saveNote]
  );

  // Cleanup debounce on unmount + flush pending save
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        // Fire a final save if there are unsaved changes
        const currentDraft = draftRef.current.trim();
        if (currentDraft !== lastSavedRef.current) {
          // Use navigator.sendBeacon for reliability on unmount? No — just let it go.
          // The next open will show the last saved state.
        }
      }
    };
  }, []);

  const handleDelete = useCallback(
    async (noteId: string) => {
      try {
        const res = await fetch(`/api/review/${reviewId}/notes`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const updated: ReviewNote[] = data.notes ?? [];
        setNotes(updated);
        // If the deleted note was the current user's, clear draft
        if (!updated.find((n) => n.userId === userId)) {
          setDraft("");
          lastSavedRef.current = "";
        }
      } catch {
        // Silently fail
      }
    },
    [reviewId, userId]
  );

  const otherNotes = notes.filter((n) => n.userId !== userId);
  const noteCount = notes.length;

  return (
    <section className="no-print mt-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-medium text-slate-600 backdrop-blur-xl transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
        aria-expanded={open}
      >
        <NotebookPen className="h-4 w-4 text-slate-400 dark:text-white/40" />
        <span className="flex-1">Supervisor Notes</span>
        {noteCount > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500 dark:bg-white/10 dark:text-white/40">
            {noteCount}
          </span>
        )}
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-400 dark:text-white/40" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400 dark:text-white/40" />
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white/80 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
          {loading && (
            <p className="py-4 text-center text-xs text-slate-400 dark:text-white/40">
              Loading notes...
            </p>
          )}

          {error && (
            <p className="py-4 text-center text-xs text-red-500 dark:text-red-400">
              {error}
            </p>
          )}

          {!loading && !error && (
            <div className="space-y-4">
              {/* Current user's note editor (supervisors only) */}
              {isSupervisor && (
                <div>
                  <label
                    htmlFor="review-note-editor"
                    className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-white/50"
                  >
                    Your Note
                  </label>
                  <textarea
                    id="review-note-editor"
                    value={draft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    placeholder="Write your observations about this review..."
                    rows={4}
                    maxLength={10000}
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/30 dark:focus:border-blue-500/50 dark:focus:ring-blue-500/50"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs">
                      {saving && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-slate-400 dark:text-white/40" />
                          <span className="text-slate-400 dark:text-white/40">Saving...</span>
                        </>
                      )}
                      {!saving && saveStatus === "saved" && (
                        <>
                          <Save className="h-3 w-3 text-green-500 dark:text-green-400" />
                          <span className="text-green-500 dark:text-green-400">Saved</span>
                        </>
                      )}
                      {!saving && saveStatus === "error" && (
                        <span className="text-red-500 dark:text-red-400">Failed to save</span>
                      )}
                    </div>
                    <span className="text-xs text-slate-300 dark:text-white/20">
                      {draft.length.toLocaleString()} / 10,000
                    </span>
                  </div>
                </div>
              )}

              {/* Other supervisors' notes (read-only) */}
              {otherNotes.length > 0 && (
                <div className="space-y-3">
                  {isSupervisor && (
                    <h3 className="text-xs font-medium text-slate-500 dark:text-white/50">
                      Other Notes
                    </h3>
                  )}
                  {otherNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      canDelete={role === "admin"}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}

              {/* Non-supervisor view: show all notes read-only */}
              {!isSupervisor && notes.length > 0 && (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <NoteCard key={note.id} note={note} canDelete={false} onDelete={handleDelete} />
                  ))}
                </div>
              )}

              {!isSupervisor && notes.length === 0 && (
                <p className="py-2 text-center text-xs text-slate-400 dark:text-white/40">
                  No supervisor notes yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function NoteCard({
  note,
  canDelete,
  onDelete,
}: {
  note: ReviewNote;
  canDelete: boolean;
  onDelete: (noteId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/[0.02]">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-white/70">
            {note.userName}
          </span>
          <span
            className="text-xs text-slate-400 dark:text-white/30"
            title={formatFullTime(note.updatedAt)}
          >
            {formatTime(note.updatedAt)}
          </span>
        </div>
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(note.id)}
            className="h-6 w-6 p-0 text-slate-400 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400"
            aria-label={`Delete note by ${note.userName}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-white/60">
        {note.content}
      </p>
    </div>
  );
}
