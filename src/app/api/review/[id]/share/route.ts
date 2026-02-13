import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, shareReview, unshareReview, logAuditEvent } from "@/lib/db";
import { hashSharePassword } from "@/lib/share-password";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Duration label -> milliseconds (null = never expires) */
const EXPIRATION_DURATIONS: Record<string, number | null> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  never: null,
};

/**
 * POST /api/review/[id]/share — Generate a share link for a completed review.
 *
 * Requires ownership (or admin). Returns 409 if the review is not done yet.
 * Idempotent: returns the existing share token if already shared.
 *
 * Optional JSON body:
 *   { expiration?: "1h" | "1d" | "1w" | "never", password?: string }
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
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const isOwner = review.userId === session.user.id;
  const isAdmin = session.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  if (review.status !== "done") {
    return Response.json(
      { error: "Only completed reviews can be shared" },
      { status: 409 }
    );
  }

  // Parse optional body for expiration and password
  let expiration: string | undefined;
  let password: string | undefined;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      expiration = body.expiration;
      password = body.password;
    }
  } catch {
    // Ignore parse errors — body is optional
  }

  // Compute expiration date
  let expiresAt: Date | null = null;
  if (expiration && expiration in EXPIRATION_DURATIONS) {
    const ms = EXPIRATION_DURATIONS[expiration];
    if (ms !== null) {
      expiresAt = new Date(Date.now() + ms);
    }
  }

  // Hash password with PBKDF2 if provided (per-link random salt, versioned format)
  const passwordHash = password ? await hashSharePassword(password) : null;

  const result = await shareReview(id, { expiresAt, passwordHash });

  // Audit log (fire-and-forget)
  logAuditEvent(id, session.user.id, session.user.email ?? null, "share.created", {
    expiration: expiration ?? "never", hasPassword: passwordHash !== null,
  }, session.user.name);

  return Response.json({
    shareToken: result.token,
    shareUrl: `/shared/${result.token}`,
    expiresAt: result.expiresAt,
    hasPassword: passwordHash !== null,
  });
}

/**
 * DELETE /api/review/[id]/share — Revoke the share link for a review.
 *
 * Requires ownership (or admin). Returns 204 on success.
 */
export async function DELETE(
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

  const isOwner = review.userId === session.user.id;
  const isAdmin = session.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  await unshareReview(id);

  // Audit log (fire-and-forget)
  logAuditEvent(id, session.user.id, session.user.email ?? null, "share.revoked", undefined, session.user.name);

  return new Response(null, { status: 204 });
}
