import { randomUUID } from "crypto";

/** A single SSE event stored in the session's replay log. */
interface SSEEvent {
  event: string;
  data: unknown;
  /** Server timestamp injected at emit time, used for accurate timing on replay. */
  ts: number;
}

type SSEWriter = (event: string, data: unknown) => void;

/**
 * In-memory session for a single review run.
 * Stores the full event log (for replay on reconnect) and a set of live SSE writers.
 * Sessions are evicted after {@link SESSION_TTL_MS}.
 */
export interface ReviewSession {
  id: string;
  status: "running" | "done" | "error";
  /** Append-only event log — replayed to late-joining clients. */
  events: SSEEvent[];
  /** Currently connected SSE writers (one per browser tab). */
  writers: Set<SSEWriter>;
  createdAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

// Attach the session map to globalThis so it survives Next.js dev server
// hot reloads (HMR re-evaluates modules, but globalThis persists).
const globalSessions = globalThis as unknown as {
  __reviewSessions?: Map<string, ReviewSession>;
  __reviewSessionsCleanup?: boolean;
};
if (!globalSessions.__reviewSessions) {
  globalSessions.__reviewSessions = new Map();
}
const sessions = globalSessions.__reviewSessions;

// Periodic cleanup of expired sessions. The flag prevents duplicate intervals
// after HMR re-evaluations. unref() lets Node exit without waiting on this timer.
if (!globalSessions.__reviewSessionsCleanup) {
  globalSessions.__reviewSessionsCleanup = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        sessions.delete(id);
      }
    }
  }, 5 * 60 * 1000).unref();
}

/** Create a new review session and return its UUID. The session starts in "running" status. */
export function createSession(): string {
  const id = randomUUID();
  sessions.set(id, {
    id,
    status: "running",
    events: [],
    writers: new Set(),
    createdAt: Date.now(),
  });
  return id;
}

/** Look up a session by UUID. Returns null if expired or non-existent. */
export function getSession(id: string): ReviewSession | null {
  return sessions.get(id) ?? null;
}

/** Push an event to the session log and broadcast to all connected writers.
 *  Injects `_ts` (server timestamp) so replayed events preserve original timing. */
export function emitEvent(id: string, event: string, data: unknown): void {
  const session = sessions.get(id);
  if (!session) return;
  const ts = Date.now();
  const stamped = { ...(data as Record<string, unknown>), _ts: ts };
  session.events.push({ event, data: stamped, ts });
  for (const writer of session.writers) {
    try { writer(event, stamped); } catch { /* writer dead, will be cleaned up */ }
  }
}

/** Mark session as done or error */
export function setSessionStatus(id: string, status: "done" | "error"): void {
  const session = sessions.get(id);
  if (session) session.status = status;
}

/** Subscribe a writer. Replays all past events, then adds to live set. */
export function subscribe(id: string, writer: SSEWriter): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  for (const evt of session.events) {
    try { writer(evt.event, evt.data); } catch { return false; }
  }
  // Also send a synthetic _startTime event so the client knows when the review began
  try { writer("_session-info", { startTime: session.createdAt }); } catch { return false; }
  session.writers.add(writer);
  return true;
}

/** Unsubscribe a writer (client disconnected). Does NOT affect the pipeline. */
export function unsubscribe(id: string, writer: SSEWriter): void {
  const session = sessions.get(id);
  if (session) session.writers.delete(writer);
}
