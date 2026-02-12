// TODO: Add rate limiting if exposed publicly (P1-1)
// TODO: Consider prompt injection mitigations for public deployment (P1-5)
import { NextRequest } from "next/server";
import type { ProviderType, CheckGroupId, LLMPhase } from "@/types/review";
import type { TokenUsage } from "@/lib/llm/structured-invoke";
import { runReviewPipeline } from "@/lib/pipeline/review-pipeline";
import { createSession, emitEvent, setSessionStatus } from "@/lib/sessions";

/**
 * POST /api/review — Accepts a PDF upload + provider choice, creates a session,
 * kicks off the review pipeline (fire-and-forget), and returns the session UUID.
 * The client then connects to /api/review/[id]/stream for SSE progress updates.
 *
 * Returns 202 with `{ id }` on success, 400 on validation errors.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;
  const providerRaw = formData.get("provider") as string | null;

  if (!file) {
    return new Response(JSON.stringify({ error: "No file provided" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  if (providerRaw !== "azure" && providerRaw !== "ollama") {
    return new Response(JSON.stringify({ error: "Invalid provider" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  const provider: ProviderType = providerRaw;

  if (file.type !== "application/pdf") {
    return new Response(
      JSON.stringify({ error: "Only PDF files are accepted" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const maxSizeMB = parseInt(process.env.MAX_PDF_SIZE_MB || "10", 10);
  if (file.size > maxSizeMB * 1024 * 1024) {
    return new Response(
      JSON.stringify({ error: `File too large. Maximum size is ${maxSizeMB}MB.` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const sessionId = createSession();
  console.log(`[api] Review ${sessionId}: ${file.name} (${(file.size / 1024).toFixed(1)} KB), provider: ${provider}`);

  const pdfBuffer = await file.arrayBuffer();

  // Throttle high-frequency events (token counts, thinking text) to avoid
  // flooding the SSE stream. Each source key gets its own last-send timestamp.
  const lastSend: Record<string, number> = {};
  const THROTTLE_MS = 200;

  function send(event: string, data: unknown) {
    emitEvent(sessionId, event, data);
  }

  function sendThrottled(key: string, event: string, data: unknown) {
    const now = Date.now();
    if (now - (lastSend[key] || 0) < THROTTLE_MS) return;
    lastSend[key] = now;
    send(event, data);
  }

  // Fire and forget — pipeline runs independently of this request
  send("step", { step: "upload", status: "done" });

  runReviewPipeline(pdfBuffer, provider, {
    onStep: (step, status) => send("step", { step, status }),
    onCheckStart: (groupId) => send("check-start", { groupId }),
    onCheckComplete: (groupId: CheckGroupId, findingCount: number, usage: TokenUsage | null) => {
      send("check-complete", { groupId, findingCount, ...(usage && { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens }) });
    },
    onCheckFailed: (groupId, error) => send("check-failed", { groupId, error }),
    onCheckTokens: (groupId: CheckGroupId, tokens: number, phase: LLMPhase) => {
      sendThrottled(`check:${groupId}`, "check-tokens", { groupId, tokens, phase });
    },
    onCheckThinking: (groupId: CheckGroupId, text: string) => {
      sendThrottled(`check-thinking:${groupId}`, "check-thinking", { groupId, text });
    },
    onMergeTokens: (tokens: number, phase: LLMPhase) => {
      sendThrottled("merge", "merge-tokens", { tokens, phase });
    },
    onMergeThinking: (text: string) => {
      sendThrottled("merge-thinking", "merge-thinking", { text });
    },
    onMergeUsage: (usage: TokenUsage) => {
      send("merge-usage", { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens });
    },
    onInputEstimate: (tokens) => send("input-estimate", { tokens }),
    onResult: (feedback) => {
      send("result", { feedback });
      send("done", {});
      setSessionStatus(sessionId, "done");
    },
    onError: (error) => {
      send("error", { error });
      setSessionStatus(sessionId, "error");
    },
  });

  return new Response(JSON.stringify({ id: sessionId }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}
