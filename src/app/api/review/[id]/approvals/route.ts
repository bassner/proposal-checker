import { requireAuth } from "@/lib/auth/helpers";
import {
  isAvailable,
  getReviewById,
  getApprovalsForReview,
  setFindingApproval,
  FINDING_APPROVAL_STATUSES,
} from "@/lib/db";
import type { FindingApprovalStatus } from "@/lib/db";
import type { MergedFeedback } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COMMENT_LENGTH = 2000;

/**
 * GET /api/review/[id]/approvals — Get all approvals for a review.
 * Returns an object keyed by finding index.
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

  // Access check: owner, admin, or phd can see approvals
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const approvals = await getApprovalsForReview(id);
  return Response.json({ approvals });
}

/**
 * POST /api/review/[id]/approvals — Set/update an approval for a finding.
 * Body: { findingIndex: number, status: FindingApprovalStatus, advisorComment?: string }
 * Only admin and phd roles can approve/dispute findings.
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

  // Only admin and phd can set approvals
  const role = session.user.role;
  if (role !== "admin" && role !== "phd") {
    return Response.json({ error: "Forbidden: insufficient role" }, { status: 403 });
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

  // Only allow approvals on completed reviews with feedback
  if (review.status !== "done" || !review.feedback) {
    return Response.json(
      { error: "Review is not complete" },
      { status: 409 }
    );
  }

  let body: { findingIndex?: unknown; status?: unknown; advisorComment?: unknown };
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

  // Bounds check against actual findings
  const feedback = review.feedback as MergedFeedback;
  const findingsCount = feedback.findings?.length ?? 0;
  if (findingIndex >= findingsCount) {
    return Response.json(
      { error: "Finding index out of bounds" },
      { status: 400 }
    );
  }

  // Validate status
  const status = typeof body.status === "string" ? body.status : "";
  if (!FINDING_APPROVAL_STATUSES.includes(status as FindingApprovalStatus)) {
    return Response.json(
      {
        error: `Invalid status. Must be one of: ${FINDING_APPROVAL_STATUSES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Validate optional comment
  const advisorComment =
    typeof body.advisorComment === "string" ? body.advisorComment.trim() : undefined;
  if (advisorComment && advisorComment.length > MAX_COMMENT_LENGTH) {
    return Response.json(
      { error: `Comment must be at most ${MAX_COMMENT_LENGTH} characters` },
      { status: 400 }
    );
  }

  const approval = await setFindingApproval(
    id,
    findingIndex,
    status as FindingApprovalStatus,
    session.user.id!,
    session.user.name ?? null,
    advisorComment
  );

  return Response.json({ ok: true, approval });
}
