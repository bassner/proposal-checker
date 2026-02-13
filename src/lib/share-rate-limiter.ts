import "server-only";

/**
 * Per-token+user rate limiter for share password verification.
 * Separate from the review rate limiter to keep concerns isolated.
 * Key format: "token:userId" — so one user's failed attempts don't block others.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const globalShareRL = globalThis as unknown as {
  __sharePasswordLimiter?: Map<string, RateLimitEntry>;
  __sharePasswordCleanup?: boolean;
};

if (!globalShareRL.__sharePasswordLimiter) {
  globalShareRL.__sharePasswordLimiter = new Map();
}

const store = globalShareRL.__sharePasswordLimiter;

export const SHARE_PASSWORD_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
} as const;

// Cleanup every 5 minutes
if (!globalShareRL.__sharePasswordCleanup) {
  globalShareRL.__sharePasswordCleanup = true;
  setInterval(() => {
    const cutoff = Date.now() - SHARE_PASSWORD_LIMIT.windowMs;
    for (const [key, entry] of store.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref();
}

export interface ShareRateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export function checkSharePasswordLimit(key: string): ShareRateLimitResult {
  const now = Date.now();
  const windowStart = now - SHARE_PASSWORD_LIMIT.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= SHARE_PASSWORD_LIMIT.maxAttempts) {
    const oldest = entry.timestamps[0];
    const retryAfter = Math.ceil((oldest + SHARE_PASSWORD_LIMIT.windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Record the attempt
  entry.timestamps.push(now);
  return { allowed: true };
}
