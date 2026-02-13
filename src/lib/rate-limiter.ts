import "server-only";

/**
 * Simple in-memory sliding window rate limiter.
 * Survives HMR via globalThis. Not distributed (single-server only).
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitStore {
  perUser: Map<string, RateLimitEntry>;
  global: RateLimitEntry;
}

// Attach to globalThis for HMR persistence
const globalRateLimit = globalThis as unknown as {
  __rateLimitStore?: RateLimitStore;
  __rateLimitCleanup?: boolean;
};

if (!globalRateLimit.__rateLimitStore) {
  globalRateLimit.__rateLimitStore = {
    perUser: new Map(),
    global: { timestamps: [] },
  };
}

const store = globalRateLimit.__rateLimitStore;

// Cleanup old entries every 5 minutes. Uses the configured window so that
// custom RATE_LIMIT_WINDOW_MS values longer than 1 hour are respected.
if (!globalRateLimit.__rateLimitCleanup) {
  globalRateLimit.__rateLimitCleanup = true;
  const CLEANUP_INTERVAL = 5 * 60 * 1000;
  setInterval(() => {
    const cutoff = Date.now() - REVIEW_RATE_LIMIT.windowMs;
    for (const [userId, entry] of store.perUser.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
      if (entry.timestamps.length === 0) {
        store.perUser.delete(userId);
      }
    }
    store.global.timestamps = store.global.timestamps.filter((ts) => ts > cutoff);
  }, CLEANUP_INTERVAL).unref();
}

interface RateLimitConfig {
  /** Maximum requests per user per window */
  perUserLimit: number;
  /** Maximum global requests per window */
  globalLimit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: "user_limit" | "global_limit";
  retryAfter?: number; // seconds until oldest request expires
}

/**
 * Check if a request is allowed under rate limits.
 * Uses sliding window: only counts requests within the time window.
 */
export function checkRateLimit(userId: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Clean old timestamps from this user's entry
  let userEntry = store.perUser.get(userId);
  if (!userEntry) {
    userEntry = { timestamps: [] };
    store.perUser.set(userId, userEntry);
  }
  userEntry.timestamps = userEntry.timestamps.filter((ts) => ts > windowStart);

  // Check per-user limit
  if (userEntry.timestamps.length >= config.perUserLimit) {
    const oldestTimestamp = userEntry.timestamps[0];
    const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);
    return { allowed: false, reason: "user_limit", retryAfter };
  }

  // Check global limit (skip entirely when disabled)
  if (Number.isFinite(config.globalLimit)) {
    store.global.timestamps = store.global.timestamps.filter((ts) => ts > windowStart);
    if (store.global.timestamps.length >= config.globalLimit) {
      const oldestTimestamp = store.global.timestamps[0];
      const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);
      return { allowed: false, reason: "global_limit", retryAfter };
    }
    store.global.timestamps.push(now);
  }

  // Allow and record
  userEntry.timestamps.push(now);

  return { allowed: true };
}

/** Parse a positive integer from an env var, falling back to a default. */
function parsePositiveInt(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const n = Number(val);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Format a millisecond window duration as a human-readable string. */
export function formatWindow(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

/** Default rate limits for review creation (configurable via env vars). */
export const REVIEW_RATE_LIMIT: RateLimitConfig = {
  perUserLimit: parsePositiveInt(process.env.RATE_LIMIT_MAX, 10),
  globalLimit: Infinity,
  windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
};
