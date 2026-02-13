import { NextRequest } from "next/server";
import type { ProviderType, ReviewMode, CheckGroupId, LLMPhase } from "@/types/review";
import { REVIEW_MODES, getCheckGroups } from "@/types/review";
import type { TokenUsage } from "@/lib/llm/structured-invoke";
import { runReviewPipeline } from "@/lib/pipeline/review-pipeline";
import { createSession, emitEvent, setSessionStatus } from "@/lib/sessions";
import { insertReview, completeReview, failReview } from "@/lib/db";
import { savePdf } from "@/lib/uploads";
import { requireAuth } from "@/lib/auth/helpers";
import { canUseProvider } from "@/lib/auth/provider-access";
import { checkRateLimit, REVIEW_RATE_LIMIT, formatWindow } from "@/lib/rate-limiter";
import { sendReviewCompleteEmail, sendReviewErrorEmail } from "@/lib/email/send";

/**
 * Sanitize error for client/DB to avoid leaking internal details.
 * Logs full error server-side, returns generic message.
 */
function sanitizeError(error: unknown, sessionId: string): string {
  // Log full error details server-side for debugging
  console.error(`[api] Review ${sessionId} failed:`, error);

  // Return generic message to client/DB
  if (typeof error === "string") {
    // If it's already a string, check if it's safe to expose
    if (error.length > 200 || error.includes("Error:") || error.includes("at ")) {
      return "Review processing failed";
    }
    return error;
  }

  return "Review processing failed";
}

/**
 * POST /api/review — Accepts a PDF upload + provider choice, creates a session,
 * kicks off the review pipeline (fire-and-forget), and returns the session UUID.
 * The client then connects to /api/review/[id]/stream for SSE progress updates.
 *
 * Returns 202 with `{ id }` on success, 400 on validation errors.
 */
export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  // Rate limiting: admins are exempt; all other users are subject to sliding window limits
  if (session.user.role !== "admin") {
    const rateLimitResult = checkRateLimit(session.user.id, REVIEW_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
      const windowText = formatWindow(REVIEW_RATE_LIMIT.windowMs);
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded (${REVIEW_RATE_LIMIT.perUserLimit} reviews per ${windowText})`,
          retryAfter: rateLimitResult.retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateLimitResult.retryAfter ?? 60),
          },
        }
      );
    }
  }

  const formData = await request.formData();
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;
  const providerRaw = formData.get("provider") as string | null;
  const modeRaw = formData.get("mode") as string | null;

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

  // Default to "proposal" for backward compatibility
  const mode: ReviewMode = (REVIEW_MODES as readonly string[]).includes(modeRaw ?? "")
    ? (modeRaw as ReviewMode)
    : "proposal";

  // Parse optional selectedGroups — validated against mode-specific groups
  const modeGroupIds = new Set(getCheckGroups(mode).map((g) => g.id));
  const selectedGroupsRaw = formData.get("selectedGroups") as string | null;
  let selectedGroups: CheckGroupId[] | undefined;
  if (selectedGroupsRaw) {
    try {
      const parsed = JSON.parse(selectedGroupsRaw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return new Response(
          JSON.stringify({ error: "selectedGroups must be a non-empty array" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      // Filter to valid mode-specific group IDs, dedup, preserve canonical order
      const requestedSet = new Set(parsed.filter((id: unknown) => typeof id === "string" && modeGroupIds.has(id as CheckGroupId)));
      if (requestedSet.size === 0) {
        return new Response(
          JSON.stringify({ error: "No valid check groups selected" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      // Canonical order from getCheckGroups(mode)
      selectedGroups = getCheckGroups(mode).map((g) => g.id).filter((id) => requestedSet.has(id));
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid selectedGroups format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Resolved groups: selectedGroups if provided, otherwise all mode groups
  const resolvedGroups = selectedGroups ?? getCheckGroups(mode).map((g) => g.id);

  const { allowed, status } = await canUseProvider(session.user.role, provider);
  if (status === "unavailable") {
    return new Response(
      JSON.stringify({ error: "Provider configuration unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Your role does not allow this provider" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

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

  const dbMeta = {
    userId: session.user.id,
    userEmail: session.user.email ?? "",
    userName: session.user.name ?? "",
    provider,
    mode,
    reviewMode: mode,
    selectedGroups: resolvedGroups,
    fileName: file.name,
  };

  const sessionId = createSession(dbMeta);
  console.log(`[api] Review ${sessionId}: PDF uploaded (${(file.size / 1024).toFixed(1)} KB), provider: ${provider}, mode: ${mode}, groups: ${resolvedGroups.length}/${modeGroupIds.size}`);

  const pdfBuffer = await file.arrayBuffer();

  // Save PDF to disk for retry support (fire-and-forget — don't block the response)
  let pdfPath: string | null = null;
  try {
    pdfPath = await savePdf(sessionId, pdfBuffer);
  } catch (err) {
    console.error("[api] PDF save failed (retry will not be available):", err);
  }

  // Persist to DB (fire-and-forget — don't block the response)
  insertReview({ id: sessionId, ...dbMeta, pdfPath, selectedGroups: resolvedGroups })
    .catch((err) => console.error("[api] DB insert failed:", err));

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

  runReviewPipeline(pdfBuffer, provider, mode, {
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
      completeReview(sessionId, feedback, dbMeta)
        .then(() =>
          sendReviewCompleteEmail({
            to: dbMeta.userEmail,
            userName: dbMeta.userName,
            fileName: dbMeta.fileName,
            reviewId: sessionId,
            feedback,
          })
        )
        .catch((err) => console.error("[api] DB complete / email failed:", err));
    },
    onError: (error) => {
      const sanitizedError = sanitizeError(error, sessionId);
      send("error", { error: sanitizedError });
      setSessionStatus(sessionId, "error");
      failReview(sessionId, sanitizedError, dbMeta)
        .then(() =>
          sendReviewErrorEmail({
            to: dbMeta.userEmail,
            userName: dbMeta.userName,
            fileName: dbMeta.fileName,
            reviewId: sessionId,
            error: sanitizedError,
          })
        )
        .catch((err) => console.error("[api] DB fail / email failed:", err));
    },
  }, selectedGroups);

  return new Response(JSON.stringify({ id: sessionId }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}
