import type { CheckGroupId, LLMPhase, MergedFeedback, Finding } from "@/types/review";
import { getCheckGroups } from "@/types/review";
import type { TokenUsage } from "@/lib/llm/structured-invoke";
import { runReviewPipeline } from "@/lib/pipeline/review-pipeline";
import { createSession, emitEvent, setSessionStatus } from "@/lib/sessions";
import {
  getReviewById,
  createVersionedReview,
  completeReview,
  failReview,
  logAuditEvent,
  getUserById,
  findDuplicateReview,
  getVersionGroup,
  generateRevisionSummary,
  getPreviousVersionReviewId,
  getAdjudicationsForReview,
} from "@/lib/db";
import { savePdf } from "@/lib/uploads";
import { requireAuth, canAccessReview } from "@/lib/auth/helpers";
import { canUseProvider } from "@/lib/auth/provider-access";
import { checkRateLimit, REVIEW_RATE_LIMIT, formatWindow } from "@/lib/rate-limiter";
import { sendReviewCompleteEmail, sendReviewErrorEmail } from "@/lib/email/send";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { hashPDFContent } from "@/lib/pdf/hash";
import type { ProviderType, ReviewMode } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanitize error for client/DB to avoid leaking internal details.
 */
function sanitizeError(error: unknown, reviewId: string): string {
  console.error(`[api] Version review ${reviewId} failed:`, error);
  if (typeof error === "string") {
    if (error.length > 200 || error.includes("Error:") || error.includes("at ")) {
      return "Review processing failed";
    }
    return error;
  }
  return "Review processing failed";
}

/**
 * POST /api/review/[id]/version — Upload a new version of a reviewed document.
 *
 * Creates a new review linked to the parent via the review_versions table.
 * The LLM pipeline receives previous findings as context for diff-aware review.
 *
 * Returns 202 with `{ id }` on success.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: parentId } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!UUID_RE.test(parentId)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  // Rate limiting
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

  // Load parent review
  const parentReview = await getReviewById(parentId);
  if (!parentReview) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Access check: owner, supervisor of owner, or admin
  if (!canAccessReview(session, parentReview)) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Parent must be completed
  if (parentReview.status !== "done") {
    return Response.json(
      { error: "Parent review must be completed before uploading a new version" },
      { status: 409 }
    );
  }

  // Latest-only enforcement: check if parent is the latest done version
  const versionGroup = await getVersionGroup(parentId);
  if (versionGroup) {
    const latestVersion = versionGroup.versions[versionGroup.versions.length - 1];
    if (latestVersion.reviewId !== parentId) {
      // Check if the latest version has an error
      const latestReview = await getReviewById(latestVersion.reviewId);
      if (latestReview?.status === "error") {
        return Response.json(
          { error: "The latest version has an error. Please retry it before uploading a new version." },
          { status: 409 }
        );
      }
      return Response.json(
        { error: "You can only upload a new version from the latest version" },
        { status: 409 }
      );
    }
  }

  // Parse FormData
  const formData = await request.formData();
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;
  const providerRaw = formData.get("provider") as string | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return Response.json({ error: "Only PDF files are accepted" }, { status: 400 });
  }

  const maxSizeMB = parseInt(process.env.MAX_PDF_SIZE_MB || "10", 10);
  if (file.size > maxSizeMB * 1024 * 1024) {
    return Response.json(
      { error: `File too large. Maximum size is ${maxSizeMB}MB.` },
      { status: 400 }
    );
  }

  // Provider: use parent's if not specified
  const provider: ProviderType = (providerRaw === "azure" || providerRaw === "ollama")
    ? providerRaw
    : parentReview.provider as ProviderType;

  const { allowed, status: providerStatus } = await canUseProvider(session.user.role, provider);
  if (providerStatus === "unavailable") {
    return Response.json({ error: "Provider configuration unavailable" }, { status: 503 });
  }
  if (!allowed) {
    return Response.json({ error: "Your role does not allow this provider" }, { status: 403 });
  }

  const pdfBuffer = await file.arrayBuffer();
  const contentHash = hashPDFContent(pdfBuffer);

  // Duplicate check (exclude parent — user may intentionally re-review same PDF)
  const documentOwnerId = parentReview.studentId ?? parentReview.userId;
  const existingDup = await findDuplicateReview(contentHash, parentReview.reviewMode, documentOwnerId);
  if (existingDup && existingDup.id !== parentId && canAccessReview(session, existingDup)) {
    return Response.json(
      { id: existingDup.id, duplicate: true },
      { status: 200 }
    );
  }

  // Inherit settings from parent
  const mode: ReviewMode = parentReview.reviewMode;
  const modeGroups = getCheckGroups(mode);
  const resolvedGroups: CheckGroupId[] = parentReview.selectedGroups
    ? modeGroups.map((g) => g.id).filter((gid) => parentReview.selectedGroups!.includes(gid))
    : modeGroups.map((g) => g.id);

  const dbMeta = {
    userId: session.user.id,
    userEmail: session.user.email ?? "",
    userName: session.user.name ?? "",
    provider,
    mode,
    reviewMode: mode,
    selectedGroups: resolvedGroups,
    fileName: file.name,
    supervisorId: parentReview.supervisorId ?? undefined,
    studentId: parentReview.studentId ?? undefined,
    contentHash,
  };

  const sessionId = createSession(dbMeta);
  console.log(`[api] Version review ${sessionId} (parent: ${parentId}): PDF uploaded (${(file.size / 1024).toFixed(1)} KB), provider: ${provider}, mode: ${mode}`);

  // Save PDF to disk
  let pdfPath: string | null = null;
  try {
    pdfPath = await savePdf(sessionId, pdfBuffer);
  } catch (err) {
    console.error("[api] PDF save failed:", err);
    return Response.json({ error: "Failed to save uploaded file" }, { status: 500 });
  }
  if (!pdfPath) {
    return Response.json({ error: "Failed to save uploaded file" }, { status: 500 });
  }

  // Create versioned review in a single transaction
  try {
    await createVersionedReview(parentId, {
      id: sessionId,
      userId: session.user.id,
      userEmail: session.user.email ?? "",
      userName: session.user.name ?? "",
      provider,
      reviewMode: mode,
      fileName: file.name,
      pdfPath,
      selectedGroups: resolvedGroups,
      supervisorId: parentReview.supervisorId,
      studentId: parentReview.studentId,
      contentHash,
    });
  } catch (err) {
    // Clean up orphaned PDF on disk
    if (pdfPath) {
      import("fs/promises").then((fs) => fs.unlink(pdfPath!)).catch(() => {});
    }
    console.error("[api] createVersionedReview failed:", err);
    const message = err instanceof Error ? err.message : "";
    const safeMessages = [
      "Parent review not found",
      "Parent review is not completed",
      "Can only upload a new version from the latest version in the group",
      "Database pool not initialized",
    ];
    const clientMessage = safeMessages.includes(message) ? message : "Failed to create version";
    return Response.json({ error: clientMessage }, { status: 409 });
  }

  // Audit log
  logAuditEvent(sessionId, session.user.id, session.user.email ?? null, "review.version_created", {
    parentReviewId: parentId, provider, mode, fileName: file.name,
  }, session.user.name);

  // Get previous findings and adjudications for diff-aware pipeline
  const parentFeedback = parentReview.feedback as MergedFeedback | null;
  const previousFindings: Finding[] | undefined = parentFeedback?.findings;
  const previousAssessment: string | undefined = parentFeedback?.summary;
  const previousAdjudications = previousFindings?.length
    ? await getAdjudicationsForReview(parentId)
    : undefined;

  // Throttle and SSE setup
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
        .then(async () => {
          // Auto-generate revision summary
          const prevVersionId = await getPreviousVersionReviewId(sessionId).catch(() => null);
          if (prevVersionId) {
            generateRevisionSummary(prevVersionId, sessionId)
              .catch((err) => console.error("[api] Revision summary generation failed:", err));
          }
          sendReviewCompleteEmail({
            to: dbMeta.userEmail,
            userName: dbMeta.userName,
            fileName: dbMeta.fileName,
            reviewId: sessionId,
            feedback,
          }).catch((err) => console.error("[api] Email failed:", err));
          // Notify student for on-behalf uploads
          if (parentReview.studentId && parentReview.studentId !== session.user.id) {
            const studentUser = await getUserById(parentReview.studentId).catch(() => null);
            if (studentUser?.email) {
              sendReviewCompleteEmail({
                to: studentUser.email,
                userName: studentUser.name,
                fileName: dbMeta.fileName,
                reviewId: sessionId,
                feedback,
              }).catch((err) => console.error("[api] Student email failed:", err));
            }
          }
          dispatchWebhookEvent("review.completed", {
            reviewId: sessionId,
            provider: dbMeta.provider,
            mode: dbMeta.mode,
            fileName: dbMeta.fileName,
            userName: dbMeta.userName,
            findingCount: feedback.findings?.length ?? 0,
            overallAssessment: feedback.overallAssessment,
            summary: feedback.summary,
          }).catch((err) => console.error("[api] Webhook dispatch failed:", err));
        })
        .catch((err) => console.error("[api] DB complete failed:", err));
    },
    onError: (error) => {
      const sanitizedError = sanitizeError(error, sessionId);
      send("error", { error: sanitizedError });
      setSessionStatus(sessionId, "error");
      failReview(sessionId, sanitizedError, dbMeta)
        .then(async () => {
          sendReviewErrorEmail({
            to: dbMeta.userEmail,
            userName: dbMeta.userName,
            fileName: dbMeta.fileName,
            reviewId: sessionId,
            error: sanitizedError,
          }).catch((err) => console.error("[api] Email failed:", err));
          dispatchWebhookEvent("review.failed", {
            reviewId: sessionId,
            provider: dbMeta.provider,
            mode: dbMeta.mode,
            fileName: dbMeta.fileName,
            userName: dbMeta.userName,
            error: sanitizedError,
          }).catch((err) => console.error("[api] Webhook dispatch failed:", err));
        })
        .catch((err) => console.error("[api] DB fail failed:", err));
    },
  }, resolvedGroups, sessionId, previousFindings ? { previousFindings, previousAssessment, previousReviewId: parentId, previousAdjudications } : undefined);

  return Response.json({ id: sessionId }, { status: 202 });
}
