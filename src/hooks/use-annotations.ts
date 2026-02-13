"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Annotations, AnnotationStatus } from "@/types/review";

const SAVE_DEBOUNCE_MS = 500;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 2;

/**
 * Manages finding annotations with optimistic UI, debounced saves,
 * and flush-on-unload to prevent data loss.
 */
export function useAnnotations(reviewId: string, initial: Annotations = {}) {
  const [annotations, setAnnotations] = useState<Annotations>(initial);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);
  const latestRef = useRef<Annotations>(initial);
  const reviewIdRef = useRef(reviewId);
  reviewIdRef.current = reviewId;

  // Sync when initial annotations change (e.g. DB fetch completes)
  useEffect(() => {
    setAnnotations(initial);
    latestRef.current = initial;
  }, [initial]);

  const doSave = useCallback(async (data: Annotations, retries = 0) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/review/${reviewIdRef.current}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: data }),
      });

      if ((res.status === 404 || res.status === 409) && retries < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return doSave(data, retries + 1);
      }

      if (!res.ok) {
        console.error("[annotations] Save failed:", res.status);
      }
    } catch (err) {
      console.error("[annotations] Save error:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = false;
      doSave(latestRef.current);
    }, SAVE_DEBOUNCE_MS);
  }, [doSave]);

  const flushPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      try {
        fetch(`/api/review/${reviewIdRef.current}/annotations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ annotations: latestRef.current }),
          keepalive: true,
        });
      } catch {
        // Best effort on page close
      }
    }
  }, []);

  // Flush on page hide / before unload
  useEffect(() => {
    const handler = () => flushPending();
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
      flushPending();
    };
  }, [flushPending]);

  const toggleAnnotation = useCallback(
    (findingIndex: number, status: AnnotationStatus) => {
      const key = String(findingIndex);
      setAnnotations((prev) => {
        const existing = prev[key];
        let next: Annotations;
        if (existing?.status === status) {
          // Toggle off: remove status but preserve comments
          if (existing.comments?.length) {
            next = { ...prev, [key]: { updatedAt: new Date().toISOString(), comments: existing.comments } };
          } else {
            next = { ...prev };
            delete next[key];
          }
        } else {
          next = {
            ...prev,
            [key]: {
              status,
              updatedAt: new Date().toISOString(),
              ...(existing?.comments?.length ? { comments: existing.comments } : {}),
            },
          };
        }
        latestRef.current = next;
        scheduleSave();
        return next;
      });
    },
    [scheduleSave]
  );

  return { annotations, toggleAnnotation, saving };
}
