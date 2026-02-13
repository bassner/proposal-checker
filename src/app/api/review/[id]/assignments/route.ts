import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, getAssignmentsForReview, assignReview, logAuditEvent } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTE_LENGTH = 2000;

/**
 * GET /api/review/[id]/assignments — List all assignments for a review.
 * Requires auth. Owner, admin, or phd can view.
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

  // Access check: owner, admin, or phd
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const assignments = await getAssignmentsForReview(id);
  return Response.json({ assignments });
}

/**
 * POST /api/review/[id]/assignments — Assign a review to a user.
 * Body: { assignedTo: string, note?: string }
 * Requires admin/phd role.
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

  let body: { assignedTo?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const assignedTo = typeof body.assignedTo === "string" ? body.assignedTo.trim() : "";
  if (!assignedTo) {
    return Response.json({ error: "assignedTo is required" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  if (note && note.length > MAX_NOTE_LENGTH) {
    return Response.json(
      { error: `Note must be at most ${MAX_NOTE_LENGTH} characters` },
      { status: 400 }
    );
  }

  const assignment = await assignReview(
    id,
    assignedTo,
    session.user.id!,
    session.user.name ?? "Unknown",
    note
  );

  logAuditEvent(id, session.user.id, session.user.email ?? null, "assignment.created", {
    assignmentId: assignment.id,
    assignedTo,
  });

  const assignments = await getAssignmentsForReview(id);
  return Response.json({ ok: true, assignment, assignments });
}
