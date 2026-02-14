import { requireAuth } from "@/lib/auth/helpers";
import {
  isAvailable,
  getReviewById,
  getResolutionsForReview,
  updateFindingResolution,
  RESOLUTION_STATUSES,
} from "@/lib/db";
import type { ResolutionStatus } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COMMENT_LENGTH = 2000;

/**
 * GET /api/review/[id]/resolutions — Get all current resolutions for a review.
 * Returns an object keyed by finding index with current status and history.
 */
export async function GET(
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

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Access check: owner, admin, or phd can see resolutions
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const resolutions = await getResolutionsForReview(id);

  // Convert Map to a plain object for JSON serialization
  const result: Record<string, { status: ResolutionStatus; history: unknown[] }> = {};
  for (const [index, entry] of resolutions) {
    result[String(index)] = entry;
  }

  return Response.json({ resolutions: result });
}

/**
 * PUT /api/review/[id]/resolutions — Update the resolution status of a finding.
 * Body: { findingIndex: number, status: ResolutionStatus, comment?: string }
 */
export async function PUT(
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
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Access check: owner, admin, or phd can update resolutions
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  let body: { findingIndex?: unknown; status?: unknown; comment?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate findingIndex
  const findingIndex =
    typeof body.findingIndex === "number" ? body.findingIndex : NaN;
  if (!Number.isInteger(findingIndex) || findingIndex < 0) {
    return Response.json(
      { error: "findingIndex must be a non-negative integer" },
      { status: 400 }
    );
  }

  // Validate findingIndex is within bounds of the review's findings
  const feedback = review.feedback as { findings?: unknown[] } | null;
  if (feedback?.findings && findingIndex >= feedback.findings.length) {
    return Response.json(
      { error: `findingIndex ${findingIndex} is out of bounds (review has ${feedback.findings.length} findings)` },
      { status: 400 }
    );
  }

  // Validate status
  const status = typeof body.status === "string" ? body.status : "";
  if (!RESOLUTION_STATUSES.includes(status as ResolutionStatus)) {
    return Response.json(
      {
        error: `Invalid status. Must be one of: ${RESOLUTION_STATUSES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Validate optional comment
  const comment =
    typeof body.comment === "string" ? body.comment.trim() : undefined;
  if (comment && comment.length > MAX_COMMENT_LENGTH) {
    return Response.json(
      { error: `Comment must be at most ${MAX_COMMENT_LENGTH} characters` },
      { status: 400 }
    );
  }

  const resolution = await updateFindingResolution(
    id,
    findingIndex,
    status as ResolutionStatus,
    session.user.id!,
    session.user.name ?? null,
    comment
  );

  return Response.json({ ok: true, resolution });
}
