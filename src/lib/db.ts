import "server-only";
import pg from "pg";
import type { AppRole } from "@/lib/auth/roles";
import type { ProviderType, ReviewMode, CheckGroupId, Annotations } from "@/types/review";

// ---------------------------------------------------------------------------
// Pool setup
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

// Attach the pool to globalThis so it survives Next.js dev server HMR
// (HMR re-evaluates modules, but globalThis persists, preventing connection leaks)
const globalDb = globalThis as unknown as {
  __dbPool?: pg.Pool | null;
  __schemaInitialized?: boolean;
};

if (!globalDb.__dbPool) {
  if (DATABASE_URL) {
    const sslConfig =
      process.env.DATABASE_SSL === "true"
        ? { ssl: { rejectUnauthorized: true } }
        : {};

    globalDb.__dbPool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 10,
      ...sslConfig,
    });

    globalDb.__dbPool.on("error", (err) => {
      console.error("[db] Unexpected pool error:", err);
    });
  } else {
    globalDb.__dbPool = null;
    console.warn(
      "[db] DATABASE_URL is not set — persistent reviews are disabled. " +
        "The in-memory SSE flow still works, but /reviews and /api/review/[id] will return 503."
    );
  }
}

const pool = globalDb.__dbPool;

// ---------------------------------------------------------------------------
// Schema auto-init (runs once on first successful connection)
// ---------------------------------------------------------------------------

async function ensureSchema(): Promise<void> {
  if (globalDb.__schemaInitialized || !pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        user_name TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('azure', 'ollama')),
        status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'error')),
        file_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        feedback JSONB,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_reviews_user_created
        ON reviews(user_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_reviews_created
        ON reviews(created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS role_provider_config (
        role TEXT PRIMARY KEY CHECK (role IN ('admin', 'phd', 'student')),
        providers TEXT[] NOT NULL CHECK (
          cardinality(providers) > 0 AND
          providers <@ ARRAY['azure', 'ollama']::text[]
        ),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Seed with current hardcoded defaults
      INSERT INTO role_provider_config (role, providers) VALUES
        ('admin', ARRAY['azure', 'ollama']::TEXT[]),
        ('phd', ARRAY['azure', 'ollama']::TEXT[]),
        ('student', ARRAY['ollama']::TEXT[])
      ON CONFLICT (role) DO NOTHING;

      -- Share links: add share_token column (safe for deployed DB)
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS share_token TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_share_token
        ON reviews(share_token) WHERE share_token IS NOT NULL;

      -- Review mode: proposal (default) or thesis
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS review_mode TEXT DEFAULT 'proposal';

      -- Finding annotations (user actions on individual findings)
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS annotations JSONB;

      -- Retry support: PDF storage path, selected check groups, retry counter
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS pdf_path TEXT;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS selected_groups JSONB;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
    `);
    globalDb.__schemaInitialized = true;
    console.log("[db] Schema initialized");
  } catch (err) {
    console.error("[db] Schema init failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the database pool is available and healthy.
 * Performs a lightweight health check query to detect runtime DB outages.
 */
export async function isAvailable(): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Review row type (returned by read queries)
// ---------------------------------------------------------------------------

export interface ReviewRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  provider: string;
  reviewMode: ReviewMode;
  status: string;
  fileName: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  feedback: unknown | null;
  errorMessage: string | null;
  shareToken: string | null;
  annotations: Annotations;
  pdfPath: string | null;
  selectedGroups: CheckGroupId[] | null;
  retryCount: number;
}

function rowToReview(row: Record<string, unknown>): ReviewRow {
  const rawMode = row.review_mode as string | null;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    userEmail: row.user_email as string,
    userName: row.user_name as string,
    provider: row.provider as string,
    reviewMode: (rawMode === "thesis" ? "thesis" : "proposal") as ReviewMode,
    status: row.status as string,
    fileName: (row.file_name as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
    feedback: row.feedback ?? null,
    errorMessage: (row.error_message as string) ?? null,
    shareToken: (row.share_token as string) ?? null,
    annotations: (row.annotations as Annotations) ?? {},
    pdfPath: (row.pdf_path as string) ?? null,
    selectedGroups: (row.selected_groups as CheckGroupId[]) ?? null,
    retryCount: Number(row.retry_count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Write operations (fire-and-forget callers — errors are logged, not thrown)
// ---------------------------------------------------------------------------

export async function insertReview(review: {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  provider: string;
  reviewMode?: ReviewMode;
  fileName: string | null;
  pdfPath?: string | null;
  selectedGroups?: CheckGroupId[];
}): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  await pool.query(
    `INSERT INTO reviews (id, user_id, user_email, user_name, provider, review_mode, file_name, pdf_path, selected_groups)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING`,
    [review.id, review.userId, review.userEmail, review.userName, review.provider, review.reviewMode ?? "proposal", review.fileName, review.pdfPath ?? null, review.selectedGroups ? JSON.stringify(review.selectedGroups) : null]
  );
}

export async function completeReview(
  id: string,
  feedback: unknown,
  meta?: { userId: string; userEmail: string; userName: string; provider: string; reviewMode?: ReviewMode; fileName?: string },
  expectedRetryCount?: number
): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  // UPSERT: handles the case where the initial INSERT was lost (e.g. DB was down briefly)
  // When expectedRetryCount is provided, only update if the review is still on that attempt
  // (prevents stale pipeline callbacks from overwriting a newer retry's state)
  const retryGuard = expectedRetryCount != null ? ` AND reviews.retry_count = ${Number(expectedRetryCount)}` : "";
  const result = await pool.query(
    `INSERT INTO reviews (id, user_id, user_email, user_name, provider, review_mode, status, feedback, file_name, completed_at, updated_at)
     VALUES ($1, $3, $4, $5, $6, $8, 'done', $2, $7, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       status = 'done',
       feedback = $2,
       error_message = NULL,
       completed_at = NOW(),
       updated_at = NOW()
     WHERE reviews.id = $1${retryGuard}`,
    [
      id,
      JSON.stringify(feedback),
      meta?.userId ?? "",
      meta?.userEmail ?? "",
      meta?.userName ?? "",
      meta?.provider ?? "azure",
      meta?.fileName ?? null,
      meta?.reviewMode ?? "proposal",
    ]
  );
  if (expectedRetryCount != null && result.rowCount === 0) {
    console.warn(`[db] completeReview ${id}: skipped — retry_count mismatch (expected ${expectedRetryCount})`);
  }
}

export async function failReview(
  id: string,
  errorMessage: string,
  meta?: { userId: string; userEmail: string; userName: string; provider: string; reviewMode?: ReviewMode; fileName?: string },
  expectedRetryCount?: number
): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  const retryGuard = expectedRetryCount != null ? ` AND reviews.retry_count = ${Number(expectedRetryCount)}` : "";
  const result = await pool.query(
    `INSERT INTO reviews (id, user_id, user_email, user_name, provider, review_mode, status, error_message, file_name, completed_at, updated_at)
     VALUES ($1, $3, $4, $5, $6, $8, 'error', $2, $7, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       status = 'error',
       error_message = $2,
       feedback = NULL,
       completed_at = NOW(),
       updated_at = NOW()
     WHERE reviews.id = $1${retryGuard}`,
    [
      id,
      errorMessage,
      meta?.userId ?? "",
      meta?.userEmail ?? "",
      meta?.userName ?? "",
      meta?.provider ?? "azure",
      meta?.fileName ?? null,
      meta?.reviewMode ?? "proposal",
    ]
  );
  if (expectedRetryCount != null && result.rowCount === 0) {
    console.warn(`[db] failReview ${id}: skipped — retry_count mismatch (expected ${expectedRetryCount})`);
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getReviewById(id: string): Promise<ReviewRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query("SELECT * FROM reviews WHERE id = $1", [id]);
  if (result.rows.length === 0) return null;
  return rowToReview(result.rows[0]);
}

// Allowed sort columns — whitelist to prevent SQL injection
const ALLOWED_SORT_COLUMNS = new Set([
  "created_at",
  "file_name",
  "provider",
  "status",
  "user_name",
]);

export interface ReviewQueryOptions {
  userId?: string; // undefined = all reviews (admin)
  limit: number;
  offset: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  search?: string;
}

export async function queryReviews(opts: ReviewQueryOptions): Promise<ReviewRow[]> {
  if (!pool) return [];
  await ensureSchema();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.userId) {
    conditions.push(`user_id = $${paramIdx++}`);
    params.push(opts.userId);
  }

  if (opts.search) {
    const pattern = `%${opts.search}%`;
    conditions.push(
      `(file_name ILIKE $${paramIdx} OR user_name ILIKE $${paramIdx} OR user_email ILIKE $${paramIdx})`
    );
    paramIdx++;
    params.push(pattern);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sortCol = opts.sortBy && ALLOWED_SORT_COLUMNS.has(opts.sortBy) ? opts.sortBy : "created_at";
  const sortDir = opts.sortDir === "asc" ? "ASC" : "DESC";

  const query = `SELECT * FROM reviews ${where} ORDER BY ${sortCol} ${sortDir}, id DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(opts.limit, opts.offset);

  const result = await pool.query(query, params);
  return result.rows.map(rowToReview);
}

export async function getReviewCount(userId?: string, search?: string): Promise<number> {
  if (!pool) return 0;
  await ensureSchema();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (userId) {
    conditions.push(`user_id = $${paramIdx++}`);
    params.push(userId);
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      `(file_name ILIKE $${paramIdx} OR user_name ILIKE $${paramIdx} OR user_email ILIKE $${paramIdx})`
    );
    paramIdx++;
    params.push(pattern);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(`SELECT COUNT(*) FROM reviews ${where}`, params);
  return parseInt(result.rows[0].count, 10);
}

// ---------------------------------------------------------------------------
// Share link operations
// ---------------------------------------------------------------------------

/**
 * Generate a share token for a review. Idempotent: if already shared, returns
 * the existing token. Retries on unique-violation (23505) for collision safety.
 */
export async function shareReview(id: string): Promise<string> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    try {
      const result = await pool.query(
        `UPDATE reviews
         SET share_token = COALESCE(share_token, $2),
             updated_at = CASE WHEN share_token IS NULL THEN NOW() ELSE updated_at END
         WHERE id = $1
         RETURNING share_token`,
        [id, token]
      );
      if (result.rowCount === 0) throw new Error("Review not found");
      return result.rows[0].share_token as string;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505" && attempt < MAX_RETRIES - 1) continue; // unique violation — retry
      throw err;
    }
  }
  throw new Error("Failed to generate unique share token");
}

/** Remove the share token from a review, revoking shared access. */
export async function unshareReview(id: string): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  await pool.query(
    "UPDATE reviews SET share_token = NULL, updated_at = NOW() WHERE id = $1",
    [id]
  );
}

/** Look up a review by its share token (public access path). */
export async function getReviewByShareToken(token: string): Promise<ReviewRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM reviews WHERE share_token = $1",
    [token]
  );
  if (result.rows.length === 0) return null;
  return rowToReview(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Annotation operations
// ---------------------------------------------------------------------------

/**
 * Save the full annotations map for a review (replaces existing).
 * The client maintains the canonical state and sends the full map on each save.
 */
export async function saveAnnotations(
  reviewId: string,
  annotations: Annotations
): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  await pool.query(
    `UPDATE reviews
     SET annotations = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [reviewId, JSON.stringify(annotations)]
  );
}

// ---------------------------------------------------------------------------
// Retry operations
// ---------------------------------------------------------------------------

const STALE_RUNNING_MS = 20 * 60 * 1000; // 20 minutes — matches client-side threshold

/**
 * Atomically claim a review for retry. Only succeeds if the review is in
 * 'error' status or is a stale 'running' review (older than 20 minutes).
 * Resets status to 'running', increments retry_count, clears terminal fields.
 * Returns the updated row or null if the claim failed (wrong status / race).
 */
export async function claimReviewForRetry(id: string): Promise<ReviewRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    `UPDATE reviews
     SET status = 'running',
         error_message = NULL,
         feedback = NULL,
         completed_at = NULL,
         annotations = '{}',
         retry_count = retry_count + 1,
         updated_at = NOW()
     WHERE id = $1
       AND (status = 'error'
            OR (status = 'running' AND updated_at < NOW() - INTERVAL '${Math.floor(STALE_RUNNING_MS / 1000)} seconds'))
     RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return rowToReview(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Role-provider configuration
// ---------------------------------------------------------------------------

export interface RoleProviderRow {
  role: AppRole;
  providers: ProviderType[];
  updatedAt: string;
}

export async function getRoleProviderConfig(): Promise<RoleProviderRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT role, providers, updated_at FROM role_provider_config ORDER BY role"
  );
  return result.rows.map((row) => ({
    role: row.role,
    providers: row.providers,
    updatedAt: (row.updated_at as Date).toISOString(),
  }));
}

export async function updateRoleProviders(
  role: AppRole,
  providers: ProviderType[]
): Promise<RoleProviderRow> {
  if (!pool) {
    throw new Error("Database pool not initialized");
  }
  await ensureSchema();

  // Canonicalize: dedupe + sort
  const canonical = [...new Set(providers)].sort();

  const result = await pool.query(
    `INSERT INTO role_provider_config (role, providers)
     VALUES ($1, $2)
     ON CONFLICT (role) DO UPDATE
     SET providers = EXCLUDED.providers, updated_at = NOW()
     RETURNING role, providers, updated_at`,
    [role, canonical]
  );

  return {
    role: result.rows[0].role,
    providers: result.rows[0].providers,
    updatedAt: (result.rows[0].updated_at as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsData {
  totalReviews: number;
  byStatus: { status: string; count: number }[];
  byProvider: { provider: string; count: number }[];
  daily: { day: string; count: number }[];
  severityAvg: { severity: string; avgCount: number }[];
  topCategories: { category: string; count: number }[];
  topUsers: { userId: string; userName: string; userEmail: string; count: number }[];
}

/**
 * Aggregate review analytics. Returns null if the pool is absent.
 * Uses a single CTE-based query for efficiency.
 * NOTE: JSONB expansion is O(total findings) — acceptable for small-scale usage
 * (single research group, hundreds of reviews). Revisit if scale grows.
 */
export async function getAnalytics(): Promise<AnalyticsData | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(`
    WITH
    severities(sev) AS (VALUES ('critical'),('major'),('minor'),('suggestion')),

    status_counts AS (
      SELECT status, COUNT(*) AS cnt FROM reviews GROUP BY status
    ),
    provider_counts AS (
      SELECT provider, COUNT(*) AS cnt FROM reviews GROUP BY provider
    ),

    daily_series AS (
      SELECT gs::date AS day
      FROM generate_series(
        (NOW() AT TIME ZONE 'UTC')::date - 29,
        (NOW() AT TIME ZONE 'UTC')::date,
        '1 day'::interval
      ) AS gs
    ),
    daily_counts AS (
      SELECT ds.day, COUNT(r.id) AS cnt
      FROM daily_series ds
      LEFT JOIN reviews r
        ON r.created_at >= (ds.day::timestamp AT TIME ZONE 'UTC')
        AND r.created_at < ((ds.day + 1)::timestamp AT TIME ZONE 'UTC')
      GROUP BY ds.day ORDER BY ds.day
    ),

    completed_reviews AS (
      SELECT id,
        CASE
          WHEN feedback IS NOT NULL AND jsonb_typeof(feedback->'findings') = 'array'
          THEN feedback->'findings'
          ELSE '[]'::jsonb
        END AS findings
      FROM reviews WHERE status = 'done'
    ),
    per_review_severity AS (
      SELECT c.id, s.sev AS severity,
        (SELECT COUNT(*) FROM jsonb_array_elements(c.findings) f WHERE f.value->>'severity' = s.sev) AS cnt
      FROM completed_reviews c CROSS JOIN severities s
    ),
    severity_avg AS (
      SELECT s.sev AS severity, COALESCE(ROUND(AVG(prs.cnt), 1), 0) AS avg_count
      FROM severities s
      LEFT JOIN per_review_severity prs ON prs.severity = s.sev
      GROUP BY s.sev
    ),

    finding_rows AS (
      SELECT f.value->>'category' AS category
      FROM completed_reviews c, jsonb_array_elements(c.findings) AS f(value)
    ),
    category_counts AS (
      SELECT category, COUNT(*) AS cnt
      FROM finding_rows
      GROUP BY category ORDER BY cnt DESC LIMIT 10
    ),

    user_counts AS (
      SELECT user_id,
        MAX(user_name) AS user_name,
        MAX(user_email) AS user_email,
        COUNT(*) AS cnt
      FROM reviews GROUP BY user_id ORDER BY cnt DESC LIMIT 5
    )

    SELECT json_build_object(
      'total', (SELECT COALESCE(SUM(cnt), 0) FROM status_counts),
      'byStatus', COALESCE((SELECT json_agg(json_build_object('status', status, 'count', cnt)) FROM status_counts), '[]'::json),
      'byProvider', COALESCE((SELECT json_agg(json_build_object('provider', provider, 'count', cnt)) FROM provider_counts), '[]'::json),
      'daily', COALESCE((SELECT json_agg(json_build_object('day', day, 'count', cnt) ORDER BY day) FROM daily_counts), '[]'::json),
      'severityAvg', COALESCE((SELECT json_agg(json_build_object('severity', severity, 'avgCount', avg_count)) FROM severity_avg), '[]'::json),
      'topCategories', COALESCE((SELECT json_agg(json_build_object('category', category, 'count', cnt)) FROM category_counts), '[]'::json),
      'topUsers', COALESCE((SELECT json_agg(json_build_object('userId', user_id, 'userName', user_name, 'userEmail', user_email, 'count', cnt)) FROM user_counts), '[]'::json)
    ) AS data
  `);

  const raw = result.rows[0].data;

  // pg returns int8/numeric as strings — parse to numbers
  return {
    totalReviews: Number(raw.total),
    byStatus: (raw.byStatus as { status: string; count: string }[]).map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
    byProvider: (raw.byProvider as { provider: string; count: string }[]).map((r) => ({
      provider: r.provider,
      count: Number(r.count),
    })),
    daily: (raw.daily as { day: string; count: string }[]).map((r) => ({
      day: r.day,
      count: Number(r.count),
    })),
    severityAvg: (raw.severityAvg as { severity: string; avgCount: string }[]).map((r) => ({
      severity: r.severity,
      avgCount: Number(r.avgCount),
    })),
    topCategories: (raw.topCategories as { category: string; count: string }[]).map((r) => ({
      category: r.category,
      count: Number(r.count),
    })),
    topUsers: (raw.topUsers as { userId: string; userName: string; userEmail: string; count: string }[]).map((r) => ({
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      count: Number(r.count),
    })),
  };
}
