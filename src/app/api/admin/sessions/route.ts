import { requireRole } from "@/lib/auth/helpers";
import { getAllSessions } from "@/lib/sessions";

export async function GET() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  const allSessions = getAllSessions().map((s) => ({
    id: s.id,
    status: s.status,
    userId: s.userId,
    userEmail: s.userEmail,
    userName: s.userName,
    provider: s.provider,
    createdAt: s.createdAt,
  }));

  return Response.json({ sessions: allSessions });
}
