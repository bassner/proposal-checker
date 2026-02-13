import { NextRequest } from "next/server";
import { getSession, subscribe, unsubscribe } from "@/lib/sessions";
import { requireAuth } from "@/lib/auth/helpers";

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * GET /api/review/[id]/stream — SSE endpoint for a review session.
 *
 * On connect, replays the full event log so clients that join mid-review (or
 * reconnect after a drop) receive consistent state. After replay, the writer
 * is added to the live set and receives events in real-time until the session
 * ends or the client disconnects.
 *
 * Client disconnection does NOT cancel the review pipeline — it keeps running
 * and storing events so a future reconnect can replay them.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let authSession;
  try {
    authSession = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) {
    return new Response(JSON.stringify({ error: "Invalid review ID" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const session = getSession(id);

  // Normalize error: return the same 404 for missing sessions AND ownership
  // failures to prevent UUID enumeration (IDOR prevention).
  if (!session) {
    return new Response(JSON.stringify({ error: "Review not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  const uid = authSession.user.id;
  const isOwner = session.userId === uid;
  const isStudent = session.studentId === uid;
  const isSupervisor = session.supervisorId === uid;
  const isAdmin = authSession.user.role === "admin";
  if (!isOwner && !isStudent && !isSupervisor && !isAdmin) {
    return new Response(JSON.stringify({ error: "Review not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let writerFn: ((event: string, data: unknown) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      writerFn = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
          // Close stream after terminal events
          if (event === "done" || event === "error") {
            try { controller.close(); } catch { /* already closed */ }
            closed = true;
            if (writerFn) unsubscribe(id, writerFn);
          }
        } catch {
          closed = true;
        }
      };

      const ok = subscribe(id, writerFn);
      if (!ok) {
        controller.close();
        closed = true;
        return;
      }

      // If the session is already done/error and we just replayed everything, close the stream
      if (session.status !== "running") {
        try { controller.close(); } catch { /* already closed */ }
        closed = true;
        if (writerFn) unsubscribe(id, writerFn);
      }
    },
    cancel() {
      // Client disconnected — remove writer but do NOT abort the pipeline
      if (writerFn) unsubscribe(id, writerFn);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
