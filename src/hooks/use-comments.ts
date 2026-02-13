"use client";

import { useState, useCallback } from "react";
import type { Annotations } from "@/types/review";

/**
 * Hook for managing supervisor comments on review findings.
 * Comments are persisted immediately (no debounce) via dedicated API.
 */
export function useComments(reviewId: string, initialAnnotations: Annotations = {}) {
  const [annotations, setAnnotations] = useState<Annotations>(initialAnnotations);
  const [submitting, setSubmitting] = useState(false);

  const addComment = useCallback(
    async (findingIndex: number, text: string) => {
      setSubmitting(true);
      try {
        const res = await fetch(`/api/review/${reviewId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ findingIndex, text }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to add comment");
        }
        const data = await res.json();
        if (data.annotations) {
          setAnnotations(data.annotations);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [reviewId]
  );

  const deleteComment = useCallback(
    async (findingIndex: number, commentId: string) => {
      try {
        const res = await fetch(`/api/review/${reviewId}/comments`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ findingIndex, commentId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to delete comment");
        }
        const data = await res.json();
        if (data.annotations) {
          setAnnotations(data.annotations);
        }
      } catch (err) {
        console.error("[comments] Delete error:", err);
      }
    },
    [reviewId]
  );

  return { annotations, setAnnotations, addComment, deleteComment, submitting };
}
