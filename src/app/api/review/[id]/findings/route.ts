import { requireRole, canAccessReview } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, addManualFinding, logAuditEvent } from "@/lib/db";
import { cacheInvalidate } from "@/lib/cache";
import type { Severity, Finding, SourceLocation } from "@/types/review";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SEVERITIES = new Set<Severity>(["critical", "major", "minor", "suggestion"]);

/**
 * POST /api/review/[id]/findings — Add a manual finding (phd/admin only).
 *
 * Body: { severity, category, title, description, locations? }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let session;
  try {
    session = await requireRole("phd");
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
  if (!review || review.status !== "done" || !review.feedback) {
    return Response.json({ error: "Review not found or not complete" }, { status: 404 });
  }

  // Access check: must be able to access this review
  if (!canAccessReview(session, review)) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  const { severity, category, title, description, locations } = body;

  if (!severity || typeof severity !== "string" || !VALID_SEVERITIES.has(severity as Severity)) {
    return Response.json({ error: "Invalid severity" }, { status: 400 });
  }

  if (!category || typeof category !== "string") {
    return Response.json({ error: "Category is required" }, { status: 400 });
  }

  if (!title || typeof title !== "string" || title.length > 500) {
    return Response.json({ error: "Title is required (max 500 chars)" }, { status: 400 });
  }

  if (!description || typeof description !== "string" || description.length > 5000) {
    return Response.json({ error: "Description is required (max 5000 chars)" }, { status: 400 });
  }

  // Validate locations (optional)
  const validatedLocations: SourceLocation[] = [];
  if (Array.isArray(locations)) {
    for (const loc of locations) {
      if (typeof loc !== "object" || loc === null) continue;
      validatedLocations.push({
        page: typeof loc.page === "number" ? loc.page : null,
        section: typeof loc.section === "string" ? loc.section : null,
        quote: typeof loc.quote === "string" ? loc.quote : "",
      });
    }
  }

  const finding: Finding = {
    severity: severity as Severity,
    category: category as string,
    title: title as string,
    description: description as string,
    locations: validatedLocations,
    manual: true,
    addedBy: session.user.name ?? session.user.email ?? "Supervisor",
  };

  const newIndex = await addManualFinding(id, finding);
  if (newIndex === null) {
    return Response.json({ error: "Failed to add finding" }, { status: 500 });
  }

  cacheInvalidate(`review:${id}`);

  logAuditEvent(id, session.user.id, session.user.email ?? null, "finding.added", {
    findingIndex: newIndex,
    severity: finding.severity,
    title: finding.title,
  }, session.user.name);

  return Response.json({ ok: true, findingIndex: newIndex, finding });
}
