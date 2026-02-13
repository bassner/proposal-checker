import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewByShareToken, sanitizeAnnotations } from "@/lib/db";
import { verifySharePassword } from "@/lib/share-password";
import { checkSharePasswordLimit, SHARE_PASSWORD_LIMIT } from "@/lib/share-rate-limiter";

const TOKEN_RE = /^[a-f0-9]{16}$/;

/**
 * POST /api/shared/[token]/verify — Verify a password for a shared review.
 *
 * Requires authentication. Expects JSON body: { password: string }.
 * Rate-limited per (token + userId) to prevent brute force.
 * Returns the full review data on success.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!TOKEN_RE.test(token)) {
    return Response.json({ error: "Invalid share token" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  // Parse password from request body
  let password: string;
  try {
    const body = await request.json();
    password = body.password;
    if (typeof password !== "string" || password.length === 0) {
      return Response.json({ error: "Password is required" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Rate limit by (token + userId) — one user's failures don't block others
  const rateLimitKey = `${token}:${session.user.id}`;
  const rateCheck = checkSharePasswordLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    return Response.json(
      {
        error: "Too many password attempts. Try again later.",
        passwordRequired: true,
        retryAfter: rateCheck.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateCheck.retryAfter ?? Math.ceil(SHARE_PASSWORD_LIMIT.windowMs / 1000)),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const review = await getReviewByShareToken(token);

  // Generic error for not-found (prevents oracle attacks)
  if (!review) {
    return Response.json(
      { error: "Shared review not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Check expiration
  if (review.shareExpiresAt) {
    const expiresAt = new Date(review.shareExpiresAt);
    if (expiresAt.getTime() < Date.now()) {
      return Response.json(
        { error: "This share link has expired" },
        { status: 410, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  // Not password-protected — shouldn't reach here, but handle gracefully
  if (!review.sharePasswordHash) {
    return Response.json(
      { error: "This share link is not password protected" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Verify password (PBKDF2 with constant-time comparison)
  const valid = await verifySharePassword(password, review.sharePasswordHash);
  if (!valid) {
    return Response.json(
      { error: "Incorrect password", passwordRequired: true },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const isSupervisor = session.user.role === "admin" || session.user.role === "phd";

  return Response.json(
    {
      id: review.id,
      status: review.status,
      provider: review.provider,
      reviewMode: review.reviewMode,
      fileName: review.fileName,
      createdAt: review.createdAt,
      feedback: review.feedback,
      userName: review.userName,
      annotations: sanitizeAnnotations(review.annotations),
      canComment: isSupervisor,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
