import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, updateWorkflowStatus } from "@/lib/db";
import { cacheInvalidate } from "@/lib/cache";
import { WORKFLOW_STATUSES, WORKFLOW_TRANSITIONS } from "@/types/review";
import type { WorkflowStatus } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Role-based transition permissions.
 * Students can: draft -> submitted, needs_revision -> submitted
 * Supervisors (admin/phd) can: submitted -> under_review, under_review -> approved|needs_revision
 */
const STUDENT_TRANSITIONS: Array<[WorkflowStatus, WorkflowStatus]> = [
  ["draft", "submitted"],
  ["needs_revision", "submitted"],
];

const SUPERVISOR_TRANSITIONS: Array<[WorkflowStatus, WorkflowStatus]> = [
  ["submitted", "under_review"],
  ["under_review", "approved"],
  ["under_review", "needs_revision"],
];

function isTransitionAllowed(
  from: WorkflowStatus,
  to: WorkflowStatus,
  role: string,
  isOwner: boolean
): boolean {
  // First check if the transition is valid at all
  const validTargets = WORKFLOW_TRANSITIONS[from];
  if (!validTargets || !validTargets.includes(to)) {
    return false;
  }

  const isSupervisor = role === "admin" || role === "phd";

  // Supervisors can perform supervisor transitions on any review
  if (isSupervisor) {
    const allowed = SUPERVISOR_TRANSITIONS.some(([f, t]) => f === from && t === to);
    if (allowed) return true;
  }

  // Owners (any role) can perform student transitions on their own reviews
  // Supervisors can also perform student transitions on any review (they have full control)
  if (isOwner || isSupervisor) {
    const allowed = STUDENT_TRANSITIONS.some(([f, t]) => f === from && t === to);
    if (allowed) return true;
  }

  return false;
}

/**
 * PATCH /api/review/[id]/workflow — Transition workflow status.
 *
 * Body: { status: WorkflowStatus }
 * Validates the transition is allowed for the user's role and the current status.
 */
export async function PATCH(
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

  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targetStatus = body.status;
  if (
    typeof targetStatus !== "string" ||
    !WORKFLOW_STATUSES.includes(targetStatus as WorkflowStatus)
  ) {
    return Response.json(
      { error: `Invalid status. Must be one of: ${WORKFLOW_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const review = await getReviewById(id);

  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const isOwner = review.userId === session.user.id;
  const isSupervisor = session.user.role === "admin" || session.user.role === "phd";

  // IDOR prevention: only owner and supervisors can see/transition
  if (!isOwner && !isSupervisor) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const currentStatus = review.workflowStatus;
  const newStatus = targetStatus as WorkflowStatus;

  if (currentStatus === newStatus) {
    return Response.json({ error: "Already in this status" }, { status: 409 });
  }

  if (!isTransitionAllowed(currentStatus, newStatus, session.user.role, isOwner)) {
    return Response.json(
      {
        error: `Cannot transition from "${currentStatus}" to "${newStatus}" with your current role`,
      },
      { status: 403 }
    );
  }

  const updated = await updateWorkflowStatus(
    id,
    newStatus,
    session.user.id,
    session.user.email ?? null
  );

  if (!updated) {
    return Response.json({ error: "Failed to update status" }, { status: 500 });
  }

  // Invalidate cached review
  cacheInvalidate(`review:${id}`);

  return Response.json({
    ok: true,
    workflowStatus: updated.workflowStatus,
  });
}
