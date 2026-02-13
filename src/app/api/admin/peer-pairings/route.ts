import { requireRole } from "@/lib/auth/helpers";
import {
  isAvailable,
  listPeerPairings,
  generatePeerPairings,
  updatePairingStatus,
  getStudentStrengthProfile,
} from "@/lib/db";
import { NextRequest } from "next/server";

/**
 * GET /api/admin/peer-pairings -- List peer pairings (admin only).
 *   ?refresh=true  -> regenerate pairings from current review data
 *   ?status=xxx    -> filter by status (suggested|accepted|rejected)
 *   ?profileFor=userId -> return strength profile for a specific student
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { searchParams } = request.nextUrl;

  // Profile sub-query: return single student's strength profile
  const profileFor = searchParams.get("profileFor");
  if (profileFor) {
    try {
      const profile = await getStudentStrengthProfile(profileFor);
      if (!profile) {
        return Response.json(
          { error: "No completed reviews found for this student" },
          { status: 404 }
        );
      }
      return Response.json({ profile });
    } catch (err) {
      console.error("[api] Failed to fetch strength profile:", err);
      return Response.json(
        { error: "Failed to fetch strength profile" },
        { status: 500 }
      );
    }
  }

  try {
    const refresh = searchParams.get("refresh") === "true";
    const statusFilter = searchParams.get("status") ?? undefined;

    const pairings = refresh
      ? await generatePeerPairings()
      : await listPeerPairings(statusFilter);

    return Response.json({ pairings });
  } catch (err) {
    console.error("[api] Failed to fetch peer pairings:", err);
    return Response.json(
      { error: "Failed to fetch peer pairings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/peer-pairings -- Accept or reject a pairing (admin only).
 * Body: { pairingId: string, status: "accepted" | "rejected" }
 */
export async function PUT(request: Request) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { pairingId, status } = body as {
    pairingId?: string;
    status?: string;
  };

  if (!pairingId || typeof pairingId !== "string") {
    return Response.json({ error: "pairingId is required" }, { status: 400 });
  }
  if (status !== "accepted" && status !== "rejected") {
    return Response.json(
      { error: 'status must be "accepted" or "rejected"' },
      { status: 400 }
    );
  }

  try {
    const pairing = await updatePairingStatus(pairingId, status);
    if (!pairing) {
      return Response.json({ error: "Pairing not found" }, { status: 404 });
    }
    return Response.json({ pairing });
  } catch (err) {
    console.error("[api] Failed to update pairing status:", err);
    return Response.json(
      { error: "Failed to update pairing status" },
      { status: 500 }
    );
  }
}
