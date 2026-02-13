import { requireAuth } from "@/lib/auth/helpers";
import {
  isAvailable,
  getReviewById,
  getFindingSLAsForReview,
  setFindingSLA,
} from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SEVERITIES = ["critical", "major", "medium", "minor", "low"];

/**
 * GET /api/review/[id]/sla — Get all SLA entries for a review.
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

  // Access check: owner, admin, or phd can view SLAs
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const slas = await getFindingSLAsForReview(id);

  // Convert to object keyed by finding index for easy client consumption
  const result: Record<string, (typeof slas)[number]> = {};
  for (const sla of slas) {
    result[String(sla.findingIndex)] = sla;
  }

  return Response.json({ slas: result });
}

/**
 * POST /api/review/[id]/sla — Set or update an SLA for a specific finding.
 * Body: { findingIndex: number, deadline: string (ISO), severity?: string }
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
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Access check: only admin or phd (supervisors) can set SLAs
  const role = session.user.role;
  if (role !== "admin" && role !== "phd") {
    return Response.json({ error: "Forbidden: insufficient role" }, { status: 403 });
  }

  let body: { findingIndex?: unknown; deadline?: unknown; severity?: unknown };
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

  // Validate deadline
  const deadline = typeof body.deadline === "string" ? body.deadline : "";
  const deadlineDate = new Date(deadline);
  if (!deadline || isNaN(deadlineDate.getTime())) {
    return Response.json(
      { error: "deadline must be a valid ISO date string" },
      { status: 400 }
    );
  }

  // Validate severity
  const severity = typeof body.severity === "string" ? body.severity : "medium";
  if (!VALID_SEVERITIES.includes(severity)) {
    return Response.json(
      { error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const sla = await setFindingSLA(
      id,
      findingIndex,
      deadlineDate.toISOString(),
      severity,
      session.user.id!,
      session.user.name ?? null
    );

    return Response.json({ ok: true, sla });
  } catch (err) {
    console.error("[api] Failed to set SLA:", err);
    return Response.json({ error: "Failed to set SLA" }, { status: 500 });
  }
}
