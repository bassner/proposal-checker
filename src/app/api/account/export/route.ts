import { requireAuth } from "@/lib/auth/helpers";
import { exportAllUserData } from "@/lib/db";

/**
 * GET /api/account/export — Export all user data as JSON (GDPR Art. 20).
 */
export async function GET() {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const data = await exportAllUserData(session.user.id);

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="proposal-checker-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
