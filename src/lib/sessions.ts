import "server-only";
import { randomUUID } from "crypto";
import type { ProviderType, ReviewMode, CheckGroupId } from "@/types/review";

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
  /** User who submitted the review. */
  userId: string;
  userEmail: string;
  userName: string;
  provider: ProviderType;
  mode: ReviewMode;
  /** Which check groups are active for this review (resolved subset of mode groups). */
  selectedGroups: CheckGroupId[];
  fileName?: string;
  /** Retry counter — incremented on each retry, used to guard event writes. */
  retryCount: number;
  /** Assigned supervisor (phd/admin who oversees). */
  supervisorId?: string;
  /** Student who authored the document. */
  studentId?: string;
}

export interface CreateSessionOptions {
  userId: string;
  userEmail: string;
  userName: string;
  provider: ProviderType;
  mode: ReviewMode;
  selectedGroups: CheckGroupId[];
  fileName?: string;
  retryCount?: number;
  supervisorId?: string;
  studentId?: string;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const COMPLETED_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes for done/error sessions
const MAX_SESSIONS = 50;

/** Transient event types that are overwritten by later events — safe to prune after completion. */
const TRANSIENT_EVENTS = new Set(["check-thinking", "merge-thinking", "check-tokens", "merge-tokens"]);

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
      const ttl = session.status === "running" ? SESSION_TTL_MS : COMPLETED_SESSION_TTL_MS;
      if (now - session.createdAt > ttl) {
        sessions.delete(id);
      }
    }
  }, 5 * 60 * 1000).unref();
}

/** Evict the oldest session if at capacity. */
function evictIfNeeded(): void {
  if (sessions.size < MAX_SESSIONS) return;
  let oldestId: string | null = null;
  let oldestSession: ReviewSession | null = null;
  for (const [sid, s] of sessions) {
    if (!oldestSession || (s.status !== "running" && oldestSession.status === "running") || s.createdAt < oldestSession.createdAt) {
      oldestId = sid;
      oldestSession = s;
    }
  }
  if (oldestId) sessions.delete(oldestId);
}

/** Build a fresh session object from options. */
function buildSession(id: string, opts: CreateSessionOptions): ReviewSession {
  return {
    id,
    status: "running",
    events: [],
    writers: new Set(),
    createdAt: Date.now(),
    userId: opts.userId,
    userEmail: opts.userEmail,
    userName: opts.userName,
    provider: opts.provider,
    mode: opts.mode,
    selectedGroups: opts.selectedGroups,
    fileName: opts.fileName,
    retryCount: opts.retryCount ?? 0,
    supervisorId: opts.supervisorId,
    studentId: opts.studentId,
  };
}

/** Create a new review session and return its UUID. The session starts in "running" status. */
export function createSession(opts: CreateSessionOptions): string {
  evictIfNeeded();
  const id = randomUUID();
  sessions.set(id, buildSession(id, opts));
  return id;
}

/**
 * Create (or replace) a session with a specific ID.
 * Used for retry: reuses the existing review ID so the client can reconnect.
 * If an old session exists, its writers are notified and removed.
 */
export function createSessionWithId(id: string, opts: CreateSessionOptions): void {
  const existing = sessions.get(id);
  if (existing) {
    // Notify old writers that the session is being retried, then clean up
    for (const writer of existing.writers) {
      try { writer("retry", { message: "Review is being retried" }); } catch { /* dead writer */ }
    }
    existing.writers.clear();
    sessions.delete(id);
  }
  evictIfNeeded();
  sessions.set(id, buildSession(id, opts));
}

/** Return all sessions (for admin panel). Sorted by creation time, newest first. */
export function getAllSessions(): ReviewSession[] {
  return Array.from(sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/** Look up a session by UUID. Returns null if expired or non-existent. */
export function getSession(id: string): ReviewSession | null {
  return sessions.get(id) ?? null;
}

/** Push an event to the session log and broadcast to all connected writers.
 *  Injects `_ts` (server timestamp) so replayed events preserve original timing.
 *  When expectedRetryCount is provided, the write is a no-op if the session's
 *  retryCount has moved past it (stale pipeline callback from a previous attempt). */
export function emitEvent(id: string, event: string, data: unknown, expectedRetryCount?: number): void {
  const session = sessions.get(id);
  if (!session) return;
  if (expectedRetryCount != null && session.retryCount !== expectedRetryCount) return;
  const ts = Date.now();
  const payload = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : { value: data };
  const stamped = { ...payload, _ts: ts };
  session.events.push({ event, data: stamped, ts });
  for (const writer of session.writers) {
    try { writer(event, stamped); } catch { /* writer dead, will be cleaned up */ }
  }
}

/** Mark session as done or error. Prunes transient events to save memory.
 *  When expectedRetryCount is provided, only updates if the session is still on that attempt. */
export function setSessionStatus(id: string, status: "done" | "error", expectedRetryCount?: number): void {
  const session = sessions.get(id);
  if (!session) return;
  if (expectedRetryCount != null && session.retryCount !== expectedRetryCount) return;
  session.status = status;
  // Prune transient events — keep only the last per source key (thinking/tokens
  // are cumulative snapshots, so only the final value matters for replay)
  const seen = new Map<string, number>();
  for (let i = session.events.length - 1; i >= 0; i--) {
    const evt = session.events[i];
    if (!TRANSIENT_EVENTS.has(evt.event)) continue;
    const groupId = (evt.data as Record<string, unknown>)?.groupId ?? "";
    const key = `${evt.event}:${groupId}`;
    if (seen.has(key)) {
      session.events[i] = null!; // mark for removal
    } else {
      seen.set(key, i);
    }
  }
  session.events = session.events.filter(Boolean);
}

/** Subscribe a writer. Emits session info first, then replays past events.
 *  Events emitted during replay are delivered live (indices >= snapshot). */
export function subscribe(id: string, writer: SSEWriter): boolean {
  const session = sessions.get(id);
  if (!session) return false;

  // Emit _session-info BEFORE replay so client knows mode/provider before
  // receiving check-group events (critical for thesis mode).
  try {
    writer("_session-info", { startTime: session.createdAt, provider: session.provider, mode: session.mode, selectedGroups: session.selectedGroups });
  } catch {
    return false;
  }

  // Snapshot event count and add writer BEFORE replay so no events are lost
  const replayEnd = session.events.length;
  session.writers.add(writer);

  // Replay [0, replayEnd) — live events with index >= replayEnd flow via broadcast
  for (let i = 0; i < replayEnd; i++) {
    const evt = session.events[i];
    try { writer(evt.event, evt.data); } catch {
      session.writers.delete(writer);
      return false;
    }
  }

  return true;
}

/** Unsubscribe a writer (client disconnected). Does NOT affect the pipeline. */
export function unsubscribe(id: string, writer: SSEWriter): void {
  const session = sessions.get(id);
  if (session) session.writers.delete(writer);
}
