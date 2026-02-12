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

// Cleanup old entries every 5 minutes
if (!globalRateLimit.__rateLimitCleanup) {
  globalRateLimit.__rateLimitCleanup = true;
  const CLEANUP_INTERVAL = 5 * 60 * 1000;
  setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    // Clean up users with no recent requests
    for (const [userId, entry] of store.perUser.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => ts > oneHourAgo);
      if (entry.timestamps.length === 0) {
        store.perUser.delete(userId);
      }
    }
    // Clean up global timestamps
    store.global.timestamps = store.global.timestamps.filter((ts) => ts > oneHourAgo);
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

  // Clean old timestamps from global entry
  store.global.timestamps = store.global.timestamps.filter((ts) => ts > windowStart);

  // Check per-user limit
  if (userEntry.timestamps.length >= config.perUserLimit) {
    const oldestTimestamp = userEntry.timestamps[0];
    const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);
    return { allowed: false, reason: "user_limit", retryAfter };
  }

  // Check global limit
  if (store.global.timestamps.length >= config.globalLimit) {
    const oldestTimestamp = store.global.timestamps[0];
    const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);
    return { allowed: false, reason: "global_limit", retryAfter };
  }

  // Allow and record
  userEntry.timestamps.push(now);
  store.global.timestamps.push(now);

  return { allowed: true };
}

/** Default rate limits for review creation */
export const REVIEW_RATE_LIMIT: RateLimitConfig = {
  perUserLimit: 20, // 20 reviews per user per hour
  globalLimit: Infinity, // No global limit
  windowMs: 60 * 60 * 1000, // 1 hour
};
