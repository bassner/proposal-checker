"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  ReviewState,
  ReviewMode,
  StepEvent,
  CheckGroupId,
  ProviderType,
  MergedFeedback,
  LLMPhase,
  StepStatus,
  Annotations,
} from "@/types/review";
import { CHECK_GROUPS, ALL_CHECK_GROUP_META, getCheckGroups } from "@/types/review";

const INITIAL_STATE: ReviewState = {
  status: "idle",
  mode: null,
  provider: null,
  currentStep: null,
  steps: {
    upload: "pending",
    extract: "pending",
    check: "pending",
    merge: "pending",
  },
  checkGroups: CHECK_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    status: "pending" as StepStatus,
  })),
  mergeTokens: 0,
  mergeReasoningTokens: 0,
  mergePhase: null,
  mergeStartTime: null,
  mergeGeneratingStartTime: null,
  mergeGeneratingStartTokenCount: 0,
  mergeEndTime: null,
  totalInputTokens: 0,
  result: null,
  error: null,
  startTime: null,
};

/**
 * Hook for the home page. POSTs a PDF + provider to `/api/review` and
 * returns the session UUID on success, or null with an error message on failure.
 */
export function useReview() {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const startReview = useCallback(
    async (file: File, provider: ProviderType, mode: ReviewMode = "proposal", selectedGroups?: CheckGroupId[]): Promise<string | null> => {
      setError(null);
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("provider", provider);
      formData.append("mode", mode);
      if (selectedGroups && selectedGroups.length > 0) {
        formData.append("selectedGroups", JSON.stringify(selectedGroups));
      }

      try {
        const response = await fetch("/api/review", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          let errorMessage = errorData.error || "Request failed";

          // Add retry information for rate limit errors
          if (response.status === 429 && errorData.retryAfter) {
            const retrySeconds = errorData.retryAfter;
            const retryMinutes = Math.ceil(retrySeconds / 60);
            if (retryMinutes === 1) {
              errorMessage += ". Try again in 1 minute.";
            } else if (retryMinutes < 60) {
              errorMessage += `. Try again in ${retryMinutes} minutes.`;
            } else {
              const retryHours = Math.ceil(retryMinutes / 60);
              errorMessage += `. Try again in ${retryHours} hour${retryHours > 1 ? "s" : ""}.`;
            }
          }

          setError(errorMessage);
          setIsUploading(false);
          return null;
        }

        const { id } = await response.json();
        // Don't reset isUploading on success — page navigates away
        return id as string;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
        setIsUploading(false);
        return null;
      }
    },
    []
  );

  return { startReview, error, isUploading };
}

/**
 * Hook for the review page. Opens an SSE connection to `/api/review/[id]/stream`,
 * replays all stored events to reconstruct current state, then continues with
 * live updates. Automatically cleans up on unmount via AbortController.
 */
export function useReviewStream(id: string) {
  const [state, setState] = useState<ReviewState>(INITIAL_STATE);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function connect() {
      try {
        const response = await fetch(`/api/review/${id}/stream`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          // 404 = session not in memory — signal fallback to DB, not an error
          if (response.status === 404) {
            setNotFound(true);
            return;
          }
          const errorData = await response.json().catch(() => ({ error: "Review not found" }));
          setState((prev) => ({
            ...prev,
            status: "error",
            error: errorData.error || "Failed to connect to review stream",
          }));
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "No response stream",
          }));
          return;
        }

        parseSSEStream(reader, setState);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Connection failed",
        }));
      }
    }

    connect();

    return () => {
      controller.abort();
    };
  }, [id]);

  return { state, notFound };
}

/** Completed review data from the database. */
export interface CompletedReview {
  id: string;
  status: "running" | "done" | "error";
  provider: string;
  reviewMode: ReviewMode;
  fileName: string | null;
  createdAt: string;
  completedAt: string | null;
  feedback: MergedFeedback | null;
  errorMessage: string | null;
  shareToken: string | null;
  annotations: Annotations;
  isOwner?: boolean;
  isStale?: boolean; // Computed when fetched for running reviews
}

/**
 * Fetches a completed review from the database.
 * Only called when the SSE stream returns 404 (session not in memory).
 */
export function useCompletedReview(id: string, enabled: boolean) {
  const [review, setReview] = useState<CompletedReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    // Move state updates into the async chain to satisfy linter
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setLoading(true);
        setError(null);
        return fetch(`/api/review/${id}`);
      })
      .then(async (res) => {
        if (!res || cancelled) return;
        if (res.status === 404) {
          setError("Review not found");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to load review");
          return;
        }
        const data = await res.json();
        // Compute staleness at fetch time (not render time) to satisfy linter
        if (data.status === "running") {
          const STALE_RUNNING_MS = 20 * 60 * 1000;
          data.isStale = Date.now() - new Date(data.createdAt).getTime() > STALE_RUNNING_MS;
        }
        setReview(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load review");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id, enabled]);

  return { review, loading, error };
}

/**
 * Incrementally parses an SSE byte stream into typed events.
 *
 * Buffers partial lines across chunks (the server may split a line across two
 * TCP segments). After the stream closes, any remaining buffered data is also
 * processed to avoid dropping the final event (fix for P2-2 — chunk boundary bug).
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  setState: React.Dispatch<React.SetStateAction<ReviewState>>
) {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          handleSSEEvent(currentEvent, data, setState);
        } catch {
          // Skip malformed JSON
        }
        currentEvent = "";
      }
    }
  }

  // Process any remaining buffered data
  if (buffer.trim()) {
    const remainingLines = buffer.split("\n");
    for (const line of remainingLines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          handleSSEEvent(currentEvent, data, setState);
        } catch {
          // Skip malformed JSON
        }
        currentEvent = "";
      }
    }
  }
}

/**
 * Ensure a check group exists in the state. If a check-group SSE event arrives
 * for a group not yet in the list (e.g. thesis-only groups when replaying), insert
 * it in canonical order based on ALL_CHECK_GROUP_META.
 */
function ensureCheckGroup(
  checkGroups: ReviewState["checkGroups"],
  groupId: CheckGroupId
): ReviewState["checkGroups"] {
  if (checkGroups.some((g) => g.id === groupId)) return checkGroups;

  const meta = ALL_CHECK_GROUP_META[groupId];
  if (!meta) return checkGroups;

  // Find canonical insertion index: after the last group that appears before this
  // one in the ALL_CHECK_GROUP_META key order.
  const allIds = Object.keys(ALL_CHECK_GROUP_META) as CheckGroupId[];
  const targetIdx = allIds.indexOf(groupId);
  let insertAt = checkGroups.length;
  for (let i = checkGroups.length - 1; i >= 0; i--) {
    const existingIdx = allIds.indexOf(checkGroups[i].id);
    if (existingIdx < targetIdx) {
      insertAt = i + 1;
      break;
    }
    if (i === 0) insertAt = 0;
  }

  const newGroup = { id: meta.id, label: meta.label, status: "pending" as StepStatus };
  const updated = [...checkGroups];
  updated.splice(insertAt, 0, newGroup);
  return updated;
}

/**
 * Applies a single SSE event to the ReviewState.
 *
 * Uses the server-injected `_ts` timestamp (added by {@link emitEvent} in sessions.ts)
 * rather than `Date.now()` so that replayed events reconstruct the correct timing
 * for duration calculations and speed-of-generation displays. Falls back to
 * `Date.now()` only if `_ts` is missing (should not happen in practice).
 */
function handleSSEEvent(
  event: string,
  data: Record<string, unknown>,
  setState: React.Dispatch<React.SetStateAction<ReviewState>>
) {
  const ts = typeof data._ts === "number" ? data._ts : Date.now();

  switch (event) {
    case "_session-info": {
      const { startTime, provider, mode, selectedGroups } = data as {
        startTime: number; provider?: string; mode?: string; selectedGroups?: string[];
      };
      const reviewMode = (mode === "thesis" ? "thesis" : "proposal") as ReviewMode;
      // Use selectedGroups if provided, otherwise show all mode groups
      const modeGroups = getCheckGroups(reviewMode);
      const activeGroups = selectedGroups && selectedGroups.length > 0
        ? modeGroups.filter((g) => selectedGroups.includes(g.id))
        : modeGroups;
      setState((prev) => ({
        ...prev,
        startTime,
        mode: reviewMode,
        checkGroups: activeGroups.map((g) => ({
          id: g.id,
          label: g.label,
          status: "pending" as StepStatus,
        })),
        ...(provider ? { provider: provider as ReviewState["provider"] } : {}),
      }));
      break;
    }

    case "step": {
      const { step, status } = data as unknown as StepEvent;
      setState((prev) => ({
        ...prev,
        currentStep: status === "active" ? step : prev.currentStep,
        steps: { ...prev.steps, [step]: status as StepStatus },
        ...(step === "merge" && status === "active" ? { mergeStartTime: ts } : {}),
        ...(step === "merge" && status === "done" ? { mergeEndTime: ts } : {}),
      }));
      break;
    }

    case "check-start": {
      const { groupId } = data as { groupId: CheckGroupId };
      setState((prev) => {
        const groups = ensureCheckGroup(prev.checkGroups, groupId);
        return {
          ...prev,
          checkGroups: groups.map((g) =>
            g.id === groupId
              ? { ...g, status: "active" as StepStatus, startTime: ts }
              : g
          ),
        };
      });
      break;
    }

    case "check-tokens": {
      const { groupId, tokens, phase } = data as {
        groupId: CheckGroupId;
        tokens: number;
        phase: LLMPhase;
      };
      setState((prev) => {
        const groups = ensureCheckGroup(prev.checkGroups, groupId);
        return {
          ...prev,
          checkGroups: groups.map((g) => {
            if (g.id !== groupId) return g;
            return {
              ...g,
              tokenCount: tokens,
              phase,
              ...(phase === "generating" && !g.generatingStartTime
                ? { generatingStartTime: ts, generatingStartTokenCount: tokens }
                : {}),
            };
          }),
        };
      });
      break;
    }

    case "check-thinking": {
      const { groupId, text } = data as {
        groupId: CheckGroupId;
        text: string;
      };
      setState((prev) => {
        const groups = ensureCheckGroup(prev.checkGroups, groupId);
        return {
          ...prev,
          checkGroups: groups.map((g) =>
            g.id === groupId
              ? { ...g, thinkingSummary: text, phase: g.phase ?? "thinking" }
              : g
          ),
        };
      });
      break;
    }

    case "check-complete": {
      const { groupId, findingCount, outputTokens, reasoningTokens } = data as {
        groupId: CheckGroupId;
        findingCount: number;
        outputTokens?: number;
        reasoningTokens?: number;
      };
      setState((prev) => {
        const groups = ensureCheckGroup(prev.checkGroups, groupId);
        return {
          ...prev,
          checkGroups: groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  status: "done" as StepStatus,
                  findingCount,
                  endTime: ts,
                  ...(outputTokens != null ? { tokenCount: outputTokens } : {}),
                  ...(reasoningTokens != null ? { reasoningTokens } : {}),
                }
              : g
          ),
        };
      });
      break;
    }

    case "check-failed": {
      const { groupId, error } = data as {
        groupId: CheckGroupId;
        error: string;
      };
      setState((prev) => {
        const groups = ensureCheckGroup(prev.checkGroups, groupId);
        return {
          ...prev,
          checkGroups: groups.map((g) =>
            g.id === groupId
              ? { ...g, status: "error" as StepStatus, error, endTime: ts }
              : g
          ),
        };
      });
      break;
    }

    case "merge-tokens": {
      const { tokens, phase } = data as { tokens: number; phase: LLMPhase };
      setState((prev) => ({
        ...prev,
        mergeTokens: tokens,
        mergePhase: phase,
        ...(phase === "generating" && !prev.mergeGeneratingStartTime
          ? { mergeGeneratingStartTime: ts, mergeGeneratingStartTokenCount: tokens }
          : {}),
      }));
      break;
    }

    case "merge-thinking": {
      const { text } = data as { text: string };
      setState((prev) => ({
        ...prev,
        mergeThinkingSummary: text,
        mergePhase: prev.mergePhase ?? "thinking",
      }));
      break;
    }

    case "merge-usage": {
      const { outputTokens, reasoningTokens } = data as { outputTokens: number; reasoningTokens?: number };
      setState((prev) => ({
        ...prev,
        mergeTokens: outputTokens,
        mergeReasoningTokens: reasoningTokens ?? 0,
      }));
      break;
    }

    case "input-estimate": {
      const { tokens } = data as { tokens: number };
      setState((prev) => ({
        ...prev,
        totalInputTokens: tokens, // cumulative total from server, not a delta
      }));
      break;
    }

    case "result": {
      const { feedback } = data as { feedback: MergedFeedback };
      setState((prev) => ({
        ...prev,
        result: feedback,
      }));
      break;
    }

    case "done": {
      setState((prev) => ({
        ...prev,
        status: "done",
      }));
      break;
    }

    case "error": {
      const { error } = data as { error: string };
      setState((prev) => ({
        ...prev,
        status: "error",
        error,
      }));
      break;
    }
  }
}
