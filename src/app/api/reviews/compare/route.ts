import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/reviews/compare?a=ID&b=ID
 *
 * Returns feedback for two reviews side-by-side.
 * Enforces ownership/admin for BOTH reviews (same IDOR pattern as /api/review/[id]).
 */
export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const url = request.nextUrl;
  const idA = url.searchParams.get("a") ?? "";
  const idB = url.searchParams.get("b") ?? "";

  if (!UUID_RE.test(idA) || !UUID_RE.test(idB)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  if (idA === idB) {
    return Response.json({ error: "Cannot compare a review with itself" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const [reviewA, reviewB] = await Promise.all([
    getReviewById(idA),
    getReviewById(idB),
  ]);

  // Same 404 for missing and unauthorized — prevents enumeration
  const isAdmin = session.user.role === "admin";
  if (
    !reviewA ||
    !reviewB ||
    (!isAdmin && reviewA.userId !== session.user.id) ||
    (!isAdmin && reviewB.userId !== session.user.id)
  ) {
    return Response.json({ error: "Reviews not found" }, { status: 404 });
  }

  // Both must be completed with valid feedback
  if (reviewA.status !== "done" || reviewB.status !== "done") {
    return Response.json(
      { error: "Both reviews must be completed before comparing" },
      { status: 400 }
    );
  }

  const feedbackA = reviewA.feedback as { findings?: unknown[] } | null;
  const feedbackB = reviewB.feedback as { findings?: unknown[] } | null;

  if (
    !feedbackA ||
    !Array.isArray(feedbackA.findings) ||
    !feedbackB ||
    !Array.isArray(feedbackB.findings)
  ) {
    return Response.json(
      { error: "Review feedback is incomplete" },
      { status: 400 }
    );
  }

  return Response.json({
    a: {
      id: reviewA.id,
      fileName: reviewA.fileName,
      createdAt: reviewA.createdAt,
      feedback: reviewA.feedback,
    },
    b: {
      id: reviewB.id,
      fileName: reviewB.fileName,
      createdAt: reviewB.createdAt,
      feedback: reviewB.feedback,
    },
  });
}
