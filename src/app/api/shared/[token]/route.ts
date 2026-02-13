import { createHash } from "node:crypto";
import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewByShareToken, sanitizeAnnotations } from "@/lib/db";

const TOKEN_RE = /^[a-f0-9]{16}$/;

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

/**
 * Constant-time string comparison to prevent timing attacks on password hashes.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Node.js crypto.timingSafeEqual requires same length
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/**
 * GET /api/shared/[token] — Fetch a review by its share token.
 *
 * Requires authentication (any logged-in user) but no ownership check.
 * Returns review metadata and feedback for rendering the shared view.
 * Checks expiration (returns 410 Gone if expired).
 * If password-protected, requires ?password= query param (returns 401 if missing/wrong).
 */
export async function GET(
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

  const review = await getReviewByShareToken(token);

  if (!review) {
    return Response.json({ error: "Shared review not found" }, { status: 404 });
  }

  // Check expiration
  if (review.shareExpiresAt) {
    const expiresAt = new Date(review.shareExpiresAt);
    if (expiresAt.getTime() < Date.now()) {
      return Response.json({ error: "This share link has expired" }, { status: 410 });
    }
  }

  // Check password protection
  if (review.sharePasswordHash) {
    const url = new URL(request.url);
    const password = url.searchParams.get("password");

    if (!password) {
      return Response.json(
        { error: "Password required", passwordRequired: true },
        { status: 401 }
      );
    }

    const providedHash = hashPassword(password);
    if (!timingSafeEqual(providedHash, review.sharePasswordHash)) {
      return Response.json(
        { error: "Incorrect password", passwordRequired: true },
        { status: 401 }
      );
    }
  }

  const isSupervisor = session.user.role === "admin" || session.user.role === "phd";

  return Response.json({
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
  });
}
