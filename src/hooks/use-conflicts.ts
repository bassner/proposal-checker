"use client";

import { useState, useEffect } from "react";
import type { AnnotationConflict } from "@/types/review";

/**
 * Fetch annotation conflicts for a review. Re-fetches periodically
 * to pick up new conflicts as annotations are saved.
 */
export function useConflicts(
  reviewId: string,
  enabled: boolean
): { conflicts: Map<number, AnnotationConflict>; loading: boolean } {
  const [conflicts, setConflicts] = useState<Map<number, AnnotationConflict>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function fetchConflicts() {
      setLoading(true);
      try {
        const res = await fetch(`/api/review/${reviewId}/conflicts`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const map = new Map<number, AnnotationConflict>();
        for (const c of data.conflicts as AnnotationConflict[]) {
          map.set(c.findingIndex, c);
        }
        setConflicts(map);
      } catch {
        // Silently ignore — conflicts are informational
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchConflicts();

    // Re-fetch every 30 seconds to pick up new conflicts
    const interval = setInterval(fetchConflicts, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reviewId, enabled]);

  return { conflicts, loading };
}
