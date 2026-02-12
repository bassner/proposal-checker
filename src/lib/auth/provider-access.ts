import "server-only";
import { getRoleProviderConfig } from "@/lib/db";
import type { AppRole } from "@/lib/auth/roles";
import type { ProviderType } from "@/types/review";

type CacheStatus = "db" | "stale-cache" | "unavailable";

const globalCache = globalThis as unknown as {
  __roleProviderCache?: {
    data: Map<AppRole, ProviderType[]>;
    expires: number;
    status: CacheStatus;
    version: number;
  };
  __roleProviderCacheVersion?: number;
  __roleProviderRetryAfter?: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_DELAY_MS = 10 * 1000; // 10 seconds backoff after DB failure

function nextVersion(): number {
  globalCache.__roleProviderCacheVersion =
    (globalCache.__roleProviderCacheVersion ?? 0) + 1;
  return globalCache.__roleProviderCacheVersion;
}

async function getDBProviders(): Promise<{
  data: Map<AppRole, ProviderType[]>;
  status: CacheStatus;
}> {
  const now = Date.now();
  const cached = globalCache.__roleProviderCache;

  // Return fresh cache
  if (cached && cached.expires > now) {
    return { data: cached.data, status: cached.status };
  }

  // Backoff: don't retry DB if we recently failed
  const retryAfter = globalCache.__roleProviderRetryAfter ?? 0;
  if (retryAfter > now) {
    if (cached) {
      return { data: cached.data, status: "stale-cache" };
    }
    return { data: new Map(), status: "unavailable" };
  }

  // Capture version before async DB call to detect concurrent invalidation
  const versionBefore = globalCache.__roleProviderCacheVersion ?? 0;

  // Try DB
  try {
    const rows = await getRoleProviderConfig();
    if (rows.length === 0) {
      throw new Error("DB returned empty role config");
    }
    const map = new Map(rows.map((r) => [r.role, r.providers]));

    // Only write cache if no invalidation happened during the DB call
    const versionNow = globalCache.__roleProviderCacheVersion ?? 0;
    if (versionNow === versionBefore) {
      globalCache.__roleProviderCache = {
        data: map,
        expires: now + CACHE_TTL_MS,
        status: "db",
        version: versionNow,
      };
    }

    // Clear retry backoff on success
    globalCache.__roleProviderRetryAfter = 0;

    return { data: map, status: "db" };
  } catch (err) {
    console.error("[provider-access] Failed to load DB config:", err);

    // Set retry backoff to avoid hammering DB
    globalCache.__roleProviderRetryAfter = now + RETRY_DELAY_MS;

    // Hybrid: use stale cache if available (warm process), else fail closed
    if (cached) {
      console.warn("[provider-access] Using stale cache due to DB error");
      return { data: cached.data, status: "stale-cache" };
    }

    // Cold start + DB down: fail closed
    console.error("[provider-access] No cache available, failing closed");
    return { data: new Map(), status: "unavailable" };
  }
}

export function invalidateProviderCache(): void {
  // Bump version so any in-flight DB read won't overwrite with stale data
  nextVersion();
  if (globalCache.__roleProviderCache) {
    globalCache.__roleProviderCache.expires = 0;
  }
  // Clear retry backoff so the next read hits DB immediately
  globalCache.__roleProviderRetryAfter = 0;
}

export async function getAllowedProviders(role: AppRole): Promise<{
  providers: ProviderType[];
  status: CacheStatus;
}> {
  const { data, status } = await getDBProviders();
  return {
    providers: data.get(role) ?? [],
    status
  };
}

export async function canUseProvider(
  role: AppRole,
  provider: ProviderType
): Promise<{ allowed: boolean; status: CacheStatus }> {
  const { providers, status } = await getAllowedProviders(role);
  return { allowed: providers.includes(provider), status };
}
