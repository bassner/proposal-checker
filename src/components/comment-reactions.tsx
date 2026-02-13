"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReactionData {
  id: string;
  commentId: string;
  userId: string;
  userName: string;
  reaction: string;
  createdAt: string;
}

interface CommentReactionsProps {
  commentId: string;
  reviewId: string;
  initialReactions?: ReactionData[];
  /** Current user ID — needed to highlight "my" reactions. */
  currentUserId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REACTION_CONFIG = [
  { key: "thumbs_up", emoji: "\uD83D\uDC4D", label: "Thumbs up" },
  { key: "lightbulb", emoji: "\uD83D\uDCA1", label: "Lightbulb" },
  { key: "question", emoji: "\u2753", label: "Question" },
  { key: "check", emoji: "\u2705", label: "Check" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommentReactions({
  commentId,
  reviewId,
  initialReactions,
  currentUserId,
}: CommentReactionsProps) {
  const [reactions, setReactions] = useState<ReactionData[]>(initialReactions ?? []);
  const [toggling, setToggling] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Fetch reactions on mount if no initial data was provided
  useEffect(() => {
    if (initialReactions || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/review/${reviewId}/comments/${commentId}/reactions`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setReactions(data.reactions ?? []);
        }
      } catch {
        // Silently ignore fetch errors on mount
      }
    })();
    return () => { cancelled = true; };
  }, [commentId, reviewId, initialReactions]);

  const toggle = useCallback(
    async (reactionKey: string) => {
      if (toggling) return;
      setToggling(reactionKey);

      // Snapshot current state for rollback
      const snapshot = reactions;

      // Optimistic update
      const existing = reactions.find(
        (r) => r.reaction === reactionKey && r.userId === currentUserId
      );
      if (existing) {
        setReactions((prev) => prev.filter((r) => r.id !== existing.id));
      } else if (currentUserId) {
        const optimistic: ReactionData = {
          id: `optimistic-${Date.now()}`,
          commentId,
          userId: currentUserId,
          userName: "",
          reaction: reactionKey,
          createdAt: new Date().toISOString(),
        };
        setReactions((prev) => [...prev, optimistic]);
      }

      try {
        const res = await fetch(
          `/api/review/${reviewId}/comments/${commentId}/reactions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reaction: reactionKey }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          setReactions(data.reactions ?? []);
        } else {
          setReactions(snapshot);
        }
      } catch {
        setReactions(snapshot);
      } finally {
        setToggling(null);
      }
    },
    [commentId, reviewId, currentUserId, toggling, reactions]
  );

  return (
    <div className="flex items-center gap-1 mt-1">
      {REACTION_CONFIG.map(({ key, emoji, label }) => {
        const count = reactions.filter((r) => r.reaction === key).length;
        const isMine = reactions.some(
          (r) => r.reaction === key && r.userId === currentUserId
        );

        return (
          <button
            key={key}
            type="button"
            disabled={toggling !== null}
            onClick={() => toggle(key)}
            title={label}
            aria-label={`${label}${count > 0 ? ` (${count})` : ""}`}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] transition-colors",
              "border",
              isMine
                ? "border-purple-400/50 bg-purple-500/15 text-purple-300"
                : count > 0
                  ? "border-slate-200/50 bg-slate-100/50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/40"
                  : "border-transparent text-slate-300 hover:border-slate-200/50 hover:bg-slate-100/50 dark:text-white/15 dark:hover:border-white/10 dark:hover:bg-white/5",
              "disabled:opacity-50"
            )}
          >
            <span className="text-[11px] leading-none">{emoji}</span>
            {count > 0 && <span className="font-medium tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
