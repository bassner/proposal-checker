import { requireAuth } from "@/lib/auth/helpers";
import {
  isAvailable,
  getAssignmentById,
  getAssignmentsForReview,
  updateAssignmentStatus,
  deleteAssignment,
  logAuditEvent,
} from "@/lib/db";
import type { AssignmentStatus } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES: AssignmentStatus[] = ["pending", "in_progress", "completed"];

/**
 * PATCH /api/review/[id]/assignments/[assignmentId] — Update assignment status.
 * Body: { status: "pending" | "in_progress" | "completed" }
 * The assignee can update their own status. Admin/phd can update any.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const { id, assignmentId } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!UUID_RE.test(id) || !UUID_RE.test(assignmentId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const assignment = await getAssignmentById(assignmentId);
  if (!assignment || assignment.reviewId !== id) {
    return Response.json({ error: "Assignment not found" }, { status: 404 });
  }

  // Access: assignee, assigner, or admin/phd
  const role = session.user.role;
  const isAssignee = assignment.assignedTo === session.user.email || assignment.assignedTo === session.user.id;
  const isSupervisor = role === "admin" || role === "phd";
  if (!isAssignee && !isSupervisor) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newStatus = body.status as string;
  if (!VALID_STATUSES.includes(newStatus as AssignmentStatus)) {
    return Response.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const updated = await updateAssignmentStatus(assignmentId, newStatus as AssignmentStatus);
  if (!updated) {
    return Response.json({ error: "Failed to update assignment" }, { status: 500 });
  }

  logAuditEvent(id, session.user.id, session.user.email ?? null, "assignment.status_updated", {
    assignmentId,
    oldStatus: assignment.status,
    newStatus,
  });

  const assignments = await getAssignmentsForReview(id);
  return Response.json({ ok: true, assignment: updated, assignments });
}

/**
 * DELETE /api/review/[id]/assignments/[assignmentId] — Remove an assignment.
 * The assigner or admin can delete.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const { id, assignmentId } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!UUID_RE.test(id) || !UUID_RE.test(assignmentId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const assignment = await getAssignmentById(assignmentId);
  if (!assignment || assignment.reviewId !== id) {
    return Response.json({ error: "Assignment not found" }, { status: 404 });
  }

  // Only the assigner or admin can delete
  const role = session.user.role;
  if (assignment.assignedBy !== session.user.id && role !== "admin") {
    return Response.json({ error: "Forbidden: only the assigner or admin can remove assignments" }, { status: 403 });
  }

  await deleteAssignment(assignmentId);

  logAuditEvent(id, session.user.id, session.user.email ?? null, "assignment.deleted", {
    assignmentId,
    assignedTo: assignment.assignedTo,
  });

  const assignments = await getAssignmentsForReview(id);
  return Response.json({ ok: true, assignments });
}
