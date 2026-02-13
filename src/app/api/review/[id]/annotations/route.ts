import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, saveAnnotations, logAuditEvent, logAnnotationChange } from "@/lib/db";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { cacheInvalidate } from "@/lib/cache";
import type { AnnotationStatus, Annotations, MergedFeedback } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set<AnnotationStatus>(["accepted", "dismissed", "fixed"]);
const INDEX_RE = /^\d+$/;

/**
 * POST /api/review/[id]/annotations — Save annotation state for findings.
 *
 * Body: { annotations: { [findingIndex: string]: { status: AnnotationStatus } } }
 * Server sets updatedAt. Full replacement of the annotations column.
 * Only the review owner can annotate.
 */
export async function POST(
  request: Request,
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

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);

  // Same 404 for missing and unauthorized (IDOR prevention)
  if (!review || review.userId !== session.user.id) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Only allow annotations on completed reviews with feedback
  if (review.status !== "done" || !review.feedback) {
    return Response.json(
      { error: "Review is not complete" },
      { status: 409 }
    );
  }

  let body: { annotations?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body.annotations;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return Response.json(
      { error: "annotations must be an object" },
      { status: 400 }
    );
  }

  const entries = Object.entries(raw as Record<string, unknown>);

  // Max 50 annotation entries (generous — max findings is 25)
  if (entries.length > 50) {
    return Response.json(
      { error: "Too many annotation entries" },
      { status: 400 }
    );
  }

  const feedback = review.feedback as MergedFeedback;
  const findingsCount = feedback.findings?.length ?? 0;
  const now = new Date().toISOString();
  const validated: Annotations = {};

  for (const [key, value] of entries) {
    if (!INDEX_RE.test(key)) {
      return Response.json(
        { error: `Invalid annotation key: ${key}` },
        { status: 400 }
      );
    }

    const idx = parseInt(key, 10);
    if (idx >= findingsCount) {
      return Response.json(
        { error: `Finding index out of bounds: ${key}` },
        { status: 400 }
      );
    }

    if (
      !value ||
      typeof value !== "object" ||
      !VALID_STATUSES.has((value as { status?: string }).status as AnnotationStatus)
    ) {
      return Response.json(
        { error: `Invalid annotation value for key ${key}` },
        { status: 400 }
      );
    }

    validated[key] = {
      status: (value as { status: AnnotationStatus }).status,
      updatedAt: now,
    };
  }

  await saveAnnotations(id, validated);

  // Invalidate cached review data — annotations have changed
  cacheInvalidate(`review:${id}`);

  // Audit log (fire-and-forget)
  logAuditEvent(id, session.user.id, session.user.email ?? null, "annotation.updated", {
    count: entries.length,
  });

  // Log each annotation change to the history table (fire-and-forget)
  for (const [key, entry] of Object.entries(validated)) {
    if (entry.status) {
      logAnnotationChange(
        id,
        parseInt(key, 10),
        session.user.id!,
        session.user.name ?? null,
        entry.status
      ).catch((err) => console.error("[api] Annotation history log failed:", err));
    }
  }

  dispatchWebhookEvent("annotation.updated", {
    reviewId: id,
    annotations: validated,
  }).catch((err) => console.error("[api] Webhook dispatch failed:", err));

  return Response.json({ ok: true });
}
