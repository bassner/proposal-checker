import type { CheckGroupId, LLMPhase } from "@/types/review";
import { getCheckGroups } from "@/types/review";
import type { TokenUsage } from "@/lib/llm/structured-invoke";
import { runReviewPipeline } from "@/lib/pipeline/review-pipeline";
import { createSessionWithId, emitEvent, setSessionStatus } from "@/lib/sessions";
import { getReviewById, claimReviewForRetry, completeReview, failReview } from "@/lib/db";
import { readPdf } from "@/lib/uploads";
import { requireAuth } from "@/lib/auth/helpers";
import { canUseProvider } from "@/lib/auth/provider-access";
import { checkRateLimit, REVIEW_RATE_LIMIT, formatWindow } from "@/lib/rate-limiter";
import type { ProviderType, ReviewMode } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanitize error for client/DB to avoid leaking internal details.
 */
function sanitizeError(error: unknown, reviewId: string): string {
  console.error(`[api] Retry review ${reviewId} failed:`, error);
  if (typeof error === "string") {
    if (error.length > 200 || error.includes("Error:") || error.includes("at ")) {
      return "Review processing failed";
    }
    return error;
  }
  return "Review processing failed";
}

/**
 * POST /api/review/[id]/retry — Retry a failed or interrupted review.
 *
 * Re-reads the PDF from disk and re-runs the full pipeline using the same
 * review ID and original settings. The review must be in 'error' status or
 * a stale 'running' status (>20 min). Uses atomic DB claim to prevent races.
 *
 * Returns 202 with `{ id }` on success, 404/409/410 on failure.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  // Step 1: Fetch review for ownership check (IDOR prevention)
  const review = await getReviewById(id);
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const isOwner = review.userId === session.user.id;
  const isAdmin = session.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Step 2: Re-check provider authorization (policy may have changed)
  const provider = review.provider as ProviderType;
  const { allowed, status: providerStatus } = await canUseProvider(session.user.role, provider);
  if (providerStatus === "unavailable") {
    return Response.json({ error: "Provider configuration unavailable" }, { status: 503 });
  }
  if (!allowed) {
    return Response.json({ error: "Your role no longer allows this provider" }, { status: 403 });
  }

  // Step 3: Rate limiting (same rules as initial submit)
  if (session.user.role !== "admin") {
    const rateLimitResult = checkRateLimit(session.user.id, REVIEW_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
      const windowText = formatWindow(REVIEW_RATE_LIMIT.windowMs);
      return Response.json(
        {
          error: `Rate limit exceeded (${REVIEW_RATE_LIMIT.perUserLimit} reviews per ${windowText})`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) },
        }
      );
    }
  }

  // Step 4: Validate PDF is still available on disk
  if (!review.pdfPath) {
    return Response.json(
      { error: "Source PDF is not available for retry. Please upload again." },
      { status: 410 }
    );
  }

  const pdfBuffer = await readPdf(review.pdfPath);
  if (!pdfBuffer) {
    return Response.json(
      { error: "Source PDF has expired. Please upload again." },
      { status: 410 }
    );
  }

  // Step 5: Atomic DB claim — prevents race conditions on concurrent retries
  const claimed = await claimReviewForRetry(id);
  if (!claimed) {
    return Response.json(
      { error: "This review cannot be retried (it may be running or already completed)" },
      { status: 409 }
    );
  }

  const retryCount = claimed.retryCount;
  const mode = claimed.reviewMode as ReviewMode;

  // Resolve check groups from DB (or fall back to all mode groups)
  const modeGroups = getCheckGroups(mode);
  const selectedGroups: CheckGroupId[] = claimed.selectedGroups
    ? modeGroups.map((g) => g.id).filter((gid) => claimed.selectedGroups!.includes(gid))
    : modeGroups.map((g) => g.id);

  // Step 6: Create in-memory SSE session (replaces any old session for this ID)
  const sessionOpts = {
    userId: claimed.userId,
    userEmail: claimed.userEmail,
    userName: claimed.userName,
    provider,
    mode,
    selectedGroups,
    fileName: claimed.fileName ?? undefined,
    retryCount,
  };
  createSessionWithId(id, sessionOpts);

  const dbMeta = {
    userId: claimed.userId,
    userEmail: claimed.userEmail,
    userName: claimed.userName,
    provider,
    reviewMode: mode,
    fileName: claimed.fileName ?? undefined,
  };

  console.log(`[api] Retry review ${id} (attempt ${retryCount}): provider=${provider}, mode=${mode}, groups=${selectedGroups.length}`);

  // Step 7: Throttle setup + fire pipeline (same pattern as initial submit)
  const lastSend: Record<string, number> = {};
  const THROTTLE_MS = 200;

  function send(event: string, data: unknown) {
    emitEvent(id, event, data, retryCount);
  }

  function sendThrottled(key: string, event: string, data: unknown) {
    const now = Date.now();
    if (now - (lastSend[key] || 0) < THROTTLE_MS) return;
    lastSend[key] = now;
    send(event, data);
  }

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
      setSessionStatus(id, "done", retryCount);
      completeReview(id, feedback, dbMeta, retryCount)
        .catch((err) => console.error("[api] DB complete failed:", err));
    },
    onError: (error) => {
      const sanitizedError = sanitizeError(error, id);
      send("error", { error: sanitizedError });
      setSessionStatus(id, "error", retryCount);
      failReview(id, sanitizedError, dbMeta, retryCount)
        .catch((err) => console.error("[api] DB fail failed:", err));
    },
  }, selectedGroups);

  return Response.json({ id }, { status: 202 });
}
