"use client";

import { useState, useCallback, useRef } from "react";
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
    results: "pending",
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

export function useReview() {
  const [state, setState] = useState<ReviewState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const startReview = useCallback(
    async (file: File, provider: ProviderType) => {
      reset();
      const startTime = Date.now();

      setState((prev) => ({
        ...prev,
        status: "running",
        provider,
        startTime,
        steps: { ...prev.steps, upload: "active" },
        currentStep: "upload",
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("provider", provider);

      try {
        const response = await fetch("/api/review", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          setState((prev) => ({
            ...prev,
            status: "error",
            error: errorData.error || "Request failed",
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
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState((prev) => ({
          ...prev,
          status: "error",
          error:
            error instanceof Error ? error.message : "An unknown error occurred",
        }));
      }
    },
    [reset]
  );

  return { state, startReview, reset };
}

function handleSSEEvent(
  event: string,
  data: Record<string, unknown>,
  setState: React.Dispatch<React.SetStateAction<ReviewState>>
) {
  switch (event) {
    case "step": {
      const { step, status } = data as unknown as StepEvent;
      setState((prev) => ({
        ...prev,
        currentStep: status === "active" ? step : prev.currentStep,
        steps: { ...prev.steps, [step]: status as StepStatus },
        ...(step === "merge" && status === "active" ? { mergeStartTime: Date.now() } : {}),
        ...(step === "merge" && status === "done" ? { mergeEndTime: Date.now() } : {}),
      }));
      break;
    }

    case "check-start": {
      const { groupId } = data as { groupId: CheckGroupId };
      setState((prev) => ({
        ...prev,
        checkGroups: prev.checkGroups.map((g) =>
          g.id === groupId
            ? { ...g, status: "active" as StepStatus, startTime: Date.now() }
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
            // Record when generation phase starts (first transition to "generating")
            ...(phase === "generating" && !g.generatingStartTime
              ? { generatingStartTime: Date.now(), generatingStartTokenCount: tokens }
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
                endTime: Date.now(),
                // Overwrite chunk count with actual output tokens from API when available
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
            ? { ...g, status: "error" as StepStatus, error, endTime: Date.now() }
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
        // Record when generation phase starts (first transition to "generating")
        ...(phase === "generating" && !prev.mergeGeneratingStartTime
          ? { mergeGeneratingStartTime: Date.now(), mergeGeneratingStartTokenCount: tokens }
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
        // Overwrite chunk count with actual output tokens from API
        mergeTokens: outputTokens,
        mergeReasoningTokens: reasoningTokens ?? 0,
      }));
      break;
    }

    case "input-estimate": {
      const { tokens } = data as { tokens: number };
      setState((prev) => ({
        ...prev,
        totalInputTokens: prev.totalInputTokens + tokens,
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
