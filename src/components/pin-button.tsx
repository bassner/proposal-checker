"use client";

import { useState, useCallback } from "react";
import { Star } from "lucide-react";

interface PinButtonProps {
  reviewId: string;
  initialPinned: boolean;
  onToggle?: (pinned: boolean) => void;
}

export function PinButton({ reviewId, initialPinned, onToggle }: PinButtonProps) {
  const [pinned, setPinned] = useState(initialPinned);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (loading) return;

      const newPinned = !pinned;

      // Optimistic update
      setPinned(newPinned);
      setLoading(true);

      try {
        const res = await fetch(`/api/review/${reviewId}/pin`, {
          method: newPinned ? "POST" : "DELETE",
        });
        if (!res.ok) {
          // Revert on failure
          setPinned(!newPinned);
        } else {
          onToggle?.(newPinned);
        }
      } catch {
        // Revert on failure
        setPinned(!newPinned);
      } finally {
        setLoading(false);
      }
    },
    [reviewId, pinned, loading, onToggle]
  );

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`rounded p-1 transition-colors ${
        pinned
          ? "text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
          : "text-slate-300 hover:bg-slate-500/10 hover:text-amber-400 dark:text-white/20 dark:hover:bg-white/5 dark:hover:text-amber-400"
      }`}
      title={pinned ? "Unpin review" : "Pin review"}
    >
      <Star
        className="h-3.5 w-3.5"
        fill={pinned ? "currentColor" : "none"}
      />
    </button>
  );
}
