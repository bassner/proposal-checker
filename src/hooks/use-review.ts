"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  ReviewState,
  StepEvent,
  CheckGroupId,
  ProviderType,
  MergedFeedback,
  LLMPhase,
  StepStatus,
} from "@/types/review";
import { CHECK_GROUPS } from "@/types/review";

const INITIAL_STATE: ReviewState = {
  status: "idle",
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
    async (file: File, provider: ProviderType): Promise<string | null> => {
      setError(null);
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("provider", provider);

      try {
        const response = await fetch("/api/review", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.error || "Request failed");
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
  const [state, setState] = useState<ReviewState>({
    ...INITIAL_STATE,
    status: "running",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function connect() {
      try {
        const response = await fetch(`/api/review/${id}/stream`, {
          signal: controller.signal,
        });

        if (!response.ok) {
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

  return { state };
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
      const { startTime } = data as { startTime: number };
      setState((prev) => ({
        ...prev,
        startTime,
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
      setState((prev) => ({
        ...prev,
        checkGroups: prev.checkGroups.map((g) =>
          g.id === groupId
            ? { ...g, status: "active" as StepStatus, startTime: ts }
            : g
        ),
      }));
      break;
    }

    case "check-tokens": {
      const { groupId, tokens, phase } = data as {
        groupId: CheckGroupId;
        tokens: number;
        phase: LLMPhase;
      };
      setState((prev) => ({
        ...prev,
        checkGroups: prev.checkGroups.map((g) => {
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
      }));
      break;
    }

    case "check-thinking": {
      const { groupId, text } = data as {
        groupId: CheckGroupId;
        text: string;
      };
      setState((prev) => ({
        ...prev,
        checkGroups: prev.checkGroups.map((g) =>
          g.id === groupId
            ? { ...g, thinkingSummary: text }
            : g
        ),
      }));
      break;
    }

    case "check-complete": {
      const { groupId, findingCount, outputTokens, reasoningTokens } = data as {
        groupId: CheckGroupId;
        findingCount: number;
        outputTokens?: number;
        reasoningTokens?: number;
      };
      setState((prev) => ({
        ...prev,
        checkGroups: prev.checkGroups.map((g) =>
          g.id === groupId
            ? {
                ...g,
                status: "done" as StepStatus,
                findingCount,
                endTime: ts,
                // Intentional: replace streaming estimate with accurate API-reported count
                ...(outputTokens != null ? { tokenCount: outputTokens } : {}),
                ...(reasoningTokens != null ? { reasoningTokens } : {}),
              }
            : g
        ),
      }));
      break;
    }

    case "check-failed": {
      const { groupId, error } = data as {
        groupId: CheckGroupId;
        error: string;
      };
      setState((prev) => ({
        ...prev,
        checkGroups: prev.checkGroups.map((g) =>
          g.id === groupId
            ? { ...g, status: "error" as StepStatus, error, endTime: ts }
            : g
        ),
      }));
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
