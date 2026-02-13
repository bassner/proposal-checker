import { requireAuth } from "@/lib/auth/helpers";
import {
  isAvailable,
  getReviewById,
  getSeverityOverridesForReview,
  overrideFindingSeverity,
  SEVERITY_VALUES,
} from "@/lib/db";
import type { SeverityValue } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON_LENGTH = 2000;

/**
 * GET /api/review/[id]/severity-override — Get all severity overrides for a review.
 * Returns an object keyed by finding index, each value is the list of overrides.
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

  // Access check: owner, admin, or phd can see overrides
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const overridesMap = await getSeverityOverridesForReview(id);

  // Convert Map to a plain object for JSON serialization
  const overrides: Record<string, unknown[]> = {};
  for (const [index, entries] of overridesMap) {
    overrides[String(index)] = entries;
  }

  return Response.json({ overrides });
}

/**
 * POST /api/review/[id]/severity-override — Create a new severity override.
 * Body: { findingIndex: number, originalSeverity: string, newSeverity: string, reason?: string }
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

  // Only admin and phd can override severities
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

  let body: {
    findingIndex?: unknown;
    originalSeverity?: unknown;
    newSeverity?: unknown;
    reason?: unknown;
  };
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

  // Validate originalSeverity
  const originalSeverity =
    typeof body.originalSeverity === "string" ? body.originalSeverity : "";
  if (!SEVERITY_VALUES.includes(originalSeverity as SeverityValue)) {
    return Response.json(
      {
        error: `Invalid originalSeverity. Must be one of: ${SEVERITY_VALUES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Validate newSeverity
  const newSeverity =
    typeof body.newSeverity === "string" ? body.newSeverity : "";
  if (!SEVERITY_VALUES.includes(newSeverity as SeverityValue)) {
    return Response.json(
      {
        error: `Invalid newSeverity. Must be one of: ${SEVERITY_VALUES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // newSeverity must differ from originalSeverity
  if (originalSeverity === newSeverity) {
    return Response.json(
      { error: "newSeverity must differ from originalSeverity" },
      { status: 400 }
    );
  }

  // Validate optional reason
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : undefined;
  if (reason && reason.length > MAX_REASON_LENGTH) {
    return Response.json(
      { error: `Reason must be at most ${MAX_REASON_LENGTH} characters` },
      { status: 400 }
    );
  }

  try {
    const override = await overrideFindingSeverity({
      reviewId: id,
      findingIndex,
      originalSeverity,
      newSeverity,
      reason,
      changedBy: session.user.id!,
      changedByName: session.user.name ?? null,
    });

    return Response.json({ ok: true, override });
  } catch (err) {
    console.error("[api] Failed to create severity override:", err);
    return Response.json(
      { error: "Failed to create severity override" },
      { status: 500 }
    );
  }
}
