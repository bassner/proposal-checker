import { requireAuth } from "@/lib/auth/helpers";
import {
  isAvailable,
  getChecklistsByUser,
  createReadinessChecklist,
  updateReadinessChecklist,
} from "@/lib/db";
import type { ChecklistItem } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_CHECKS = 50;
const MAX_LABEL_LENGTH = 500;

function validateChecks(
  checks: unknown
): { valid: true; items: ChecklistItem[] } | { valid: false; error: string } {
  if (!Array.isArray(checks)) {
    return { valid: false, error: "checks must be an array" };
  }
  if (checks.length === 0) {
    return { valid: false, error: "checks must not be empty" };
  }
  if (checks.length > MAX_CHECKS) {
    return { valid: false, error: `checks must have at most ${MAX_CHECKS} items` };
  }
  const items: ChecklistItem[] = [];
  for (const item of checks) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof item.label !== "string" ||
      typeof item.checked !== "boolean"
    ) {
      return {
        valid: false,
        error: "Each check must have a string label and boolean checked",
      };
    }
    const label = item.label.trim();
    if (!label || label.length > MAX_LABEL_LENGTH) {
      return {
        valid: false,
        error: `Each label must be between 1 and ${MAX_LABEL_LENGTH} characters`,
      };
    }
    items.push({ label, checked: item.checked });
  }
  return { valid: true, items };
}

/**
 * GET /api/readiness-checklist — List the current user's checklists.
 */
export async function GET() {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const checklists = await getChecklistsByUser(session.user.id!);
  return Response.json({ checklists });
}

/**
 * POST /api/readiness-checklist — Create or update a checklist.
 * Body: { id?, fileName?, checks: [{label, checked}], reviewId? }
 * If `id` is provided, updates that checklist (must be owned by user).
 * Otherwise creates a new one.
 */
export async function POST(request: Request) {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  let body: {
    id?: unknown;
    fileName?: unknown;
    checks?: unknown;
    reviewId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateChecks(body.checks);
  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const fileName =
    typeof body.fileName === "string" ? body.fileName.trim() || null : null;
  const reviewId =
    typeof body.reviewId === "string" && UUID_RE.test(body.reviewId)
      ? body.reviewId
      : null;

  // Update existing checklist
  if (typeof body.id === "string" && UUID_RE.test(body.id)) {
    const updated = await updateReadinessChecklist(
      body.id,
      session.user.id!,
      { fileName, checks: validation.items, reviewId }
    );
    if (!updated) {
      return Response.json(
        { error: "Checklist not found or not owned by you" },
        { status: 404 }
      );
    }
    return Response.json({ checklist: updated });
  }

  // Create new checklist
  const checklist = await createReadinessChecklist({
    userId: session.user.id!,
    fileName,
    checks: validation.items,
    reviewId,
  });

  if (!checklist) {
    return Response.json(
      { error: "Failed to create checklist" },
      { status: 500 }
    );
  }

  return Response.json({ checklist }, { status: 201 });
}
