import "server-only";

/**
 * In-memory LRU cache with TTL eviction.
 *
 * Uses the same globalThis pattern as sessions.ts to survive Next.js dev
 * server HMR (module re-evaluations). Max 500 entries; oldest entries are
 * evicted on overflow. Expired entries are cleaned up periodically and on
 * access.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 500;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// globalThis persistence (survives HMR)
// ---------------------------------------------------------------------------

const globalCache = globalThis as unknown as {
  __appCache?: Map<string, CacheEntry>;
  __appCacheCleanup?: boolean;
};

if (!globalCache.__appCache) {
  globalCache.__appCache = new Map();
}

const store = globalCache.__appCache;

// Periodic cleanup of expired entries. The flag prevents duplicate intervals
// after HMR re-evaluations. unref() lets Node exit without waiting on this timer.
if (!globalCache.__appCacheCleanup) {
  globalCache.__appCacheCleanup = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.expiresAt) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS).unref();
}

// ---------------------------------------------------------------------------
// Eviction helpers
// ---------------------------------------------------------------------------

/** Evict the oldest entry if at capacity. */
function evictIfNeeded(): void {
  if (store.size < MAX_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of store) {
    if (entry.createdAt < oldestTime) {
      oldestTime = entry.createdAt;
      oldestKey = key;
    }
  }
  if (oldestKey) store.delete(oldestKey);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve a cached value by key. Returns `undefined` on miss or expiry.
 * Expired entries are lazily cleaned up on access.
 */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/**
 * Store a value in the cache. Overwrites any existing entry for the same key.
 * Evicts the oldest entry when the cache is at capacity.
 *
 * @param key   Cache key
 * @param value Value to cache
 * @param ttlMs Time-to-live in milliseconds (default: 24 hours)
 */
export function cacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  // Delete first so the Map insertion order is refreshed (acts as LRU touch)
  store.delete(key);
  evictIfNeeded();
  const now = Date.now();
  store.set(key, { value, expiresAt: now + ttlMs, createdAt: now });
}

/** Remove a single entry by exact key. */
export function cacheInvalidate(key: string): void {
  store.delete(key);
}

/** Remove all entries whose key starts with `prefix`. */
export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
