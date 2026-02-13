import "server-only";
import pg from "pg";
import type { AppRole } from "@/lib/auth/roles";
import type { ProviderType, ReviewMode, CheckGroupId, Annotations, Comment, AnnotationConflict } from "@/types/review";

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

      -- Share link security: expiration and password protection
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMPTZ;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS share_password_hash TEXT;

      -- Retry support: PDF storage path, selected check groups, retry counter
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS pdf_path TEXT;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS selected_groups JSONB;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

      -- Soft delete support
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

      -- Notifications
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'comment' CHECK (type IN ('comment')),
        message TEXT NOT NULL,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON notifications(user_id, read, created_at DESC);

      -- Review templates (admin-configurable presets)
      CREATE TABLE IF NOT EXISTS review_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        check_groups JSONB NOT NULL,
        review_mode TEXT NOT NULL DEFAULT 'proposal' CHECK (review_mode IN ('proposal', 'thesis')),
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Webhooks
      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url TEXT NOT NULL,
        events JSONB NOT NULL DEFAULT '[]'::jsonb,
        secret TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Pinned reviews (bookmarks for quick access)
      CREATE TABLE IF NOT EXISTS pinned_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, review_id)
      );

      CREATE INDEX IF NOT EXISTS idx_pinned_reviews_user
        ON pinned_reviews(user_id);

      -- Check group performance metrics
      CREATE TABLE IF NOT EXISTS check_performance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL,
        check_group TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('done', 'error')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_check_performance_group
        ON check_performance(check_group, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_check_performance_review
        ON check_performance(review_id);

      -- Audit log
      CREATE TABLE IF NOT EXISTS review_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL,
        user_id TEXT,
        user_email TEXT,
        action TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_log_review_created
        ON review_audit_log(review_id, created_at DESC);

      -- Annotation history (for conflict detection)
      CREATE TABLE IF NOT EXISTS annotation_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL,
        finding_index INT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_annotation_history_review
        ON annotation_history(review_id, finding_index);
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
  shareExpiresAt: string | null;
  sharePasswordHash: string | null;
  annotations: Annotations;
  pdfPath: string | null;
  selectedGroups: CheckGroupId[] | null;
  retryCount: number;
  deletedAt: string | null;
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
    shareExpiresAt: row.share_expires_at ? (row.share_expires_at as Date).toISOString() : null,
    sharePasswordHash: (row.share_password_hash as string) ?? null,
    annotations: (row.annotations as Annotations) ?? {},
    pdfPath: (row.pdf_path as string) ?? null,
    selectedGroups: (row.selected_groups as CheckGroupId[]) ?? null,
    retryCount: Number(row.retry_count ?? 0),
    deletedAt: row.deleted_at ? (row.deleted_at as Date).toISOString() : null,
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
// Soft delete
// ---------------------------------------------------------------------------

/**
 * Soft-delete a review by setting deleted_at. Returns true if the row was
 * actually updated (i.e. it existed and wasn't already deleted).
 */
export async function softDeleteReview(id: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    "UPDATE reviews SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getReviewById(id: string): Promise<ReviewRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query("SELECT * FROM reviews WHERE id = $1 AND deleted_at IS NULL", [id]);
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

  const conditions: string[] = ["deleted_at IS NULL"];
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

  const where = `WHERE ${conditions.join(" AND ")}`;

  const sortCol = opts.sortBy && ALLOWED_SORT_COLUMNS.has(opts.sortBy) ? opts.sortBy : "created_at";
  const sortDir = opts.sortDir === "asc" ? "ASC" : "DESC";

  const query = `SELECT * FROM reviews ${where} ORDER BY ${sortCol} ${sortDir}, id DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(opts.limit, opts.offset);

  const result = await pool.query(query, params);
  return result.rows.map(rowToReview);
}

// ---------------------------------------------------------------------------
// Grouped reviews (lightweight query for file-history grouping)
// ---------------------------------------------------------------------------

export interface GroupedReviewItem {
  id: string;
  fileName: string | null;
  userId: string;
  userName: string;
  createdAt: string;
  status: string;
  findingCount: number;
}

const GROUPED_CAP = 500;

/**
 * Lightweight query for the "Group by file" view.
 * Returns minimal columns + SQL-computed findingCount. Capped at 500 rows.
 */
export async function queryReviewsGrouped(opts: {
  userId?: string;
  search?: string;
}): Promise<{ reviews: GroupedReviewItem[]; total: number; truncated: boolean }> {
  if (!pool) return { reviews: [], total: 0, truncated: false };
  await ensureSchema();

  const conditions: string[] = ["deleted_at IS NULL"];
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

  const where = `WHERE ${conditions.join(" AND ")}`;

  // Count total first
  const countResult = await pool.query(`SELECT COUNT(*) FROM reviews ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  const query = `
    SELECT id, file_name, user_id, user_name, created_at, status,
      CASE
        WHEN feedback IS NOT NULL AND jsonb_typeof(feedback->'findings') = 'array'
        THEN jsonb_array_length(feedback->'findings')
        ELSE 0
      END AS finding_count
    FROM reviews ${where}
    ORDER BY created_at DESC, id DESC
    LIMIT ${GROUPED_CAP}`;

  const result = await pool.query(query, params);
  const reviews: GroupedReviewItem[] = result.rows.map((row) => ({
    id: row.id as string,
    fileName: (row.file_name as string) ?? null,
    userId: row.user_id as string,
    userName: row.user_name as string,
    createdAt: (row.created_at as Date).toISOString(),
    status: row.status as string,
    findingCount: parseInt(row.finding_count, 10),
  }));

  return { reviews, total, truncated: total > GROUPED_CAP };
}

export async function getReviewCount(userId?: string, search?: string): Promise<number> {
  if (!pool) return 0;
  await ensureSchema();

  const conditions: string[] = ["deleted_at IS NULL"];
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

  const where = `WHERE ${conditions.join(" AND ")}`;
  const result = await pool.query(`SELECT COUNT(*) FROM reviews ${where}`, params);
  return parseInt(result.rows[0].count, 10);
}

// ---------------------------------------------------------------------------
// Share link operations
// ---------------------------------------------------------------------------

/**
 * Generate a share token for a review. Idempotent: if already shared, returns
 * the existing token. Retries on unique-violation (23505) for collision safety.
 * Optionally sets an expiration time and/or password hash.
 */
export async function shareReview(
  id: string,
  options?: { expiresAt?: Date | null; passwordHash?: string | null }
): Promise<{ token: string; expiresAt: string | null }> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();

  const expiresAt = options?.expiresAt ?? null;
  const passwordHash = options?.passwordHash ?? null;

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    try {
      const result = await pool.query(
        `UPDATE reviews
         SET share_token = COALESCE(share_token, $2),
             share_expires_at = CASE WHEN share_token IS NULL THEN $3 ELSE share_expires_at END,
             share_password_hash = CASE WHEN share_token IS NULL THEN $4 ELSE share_password_hash END,
             updated_at = CASE WHEN share_token IS NULL THEN NOW() ELSE updated_at END
         WHERE id = $1
         RETURNING share_token, share_expires_at`,
        [id, token, expiresAt, passwordHash]
      );
      if (result.rowCount === 0) throw new Error("Review not found");
      const row = result.rows[0];
      return {
        token: row.share_token as string,
        expiresAt: row.share_expires_at ? (row.share_expires_at as Date).toISOString() : null,
      };
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
    "UPDATE reviews SET share_token = NULL, share_expires_at = NULL, share_password_hash = NULL, updated_at = NOW() WHERE id = $1",
    [id]
  );
}

/** Look up a review by its share token (internal use — includes password hash). */
export async function getReviewByShareToken(token: string): Promise<ReviewRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM reviews WHERE share_token = $1 AND deleted_at IS NULL",
    [token]
  );
  if (result.rows.length === 0) return null;
  return rowToReview(result.rows[0]);
}

/** Lightweight share link metadata (never exposes password hash or feedback). */
export interface SharedReviewMeta {
  hasPassword: boolean;
  expired: boolean;
}

/**
 * Check if a share token exists and get its metadata.
 * Uses a narrow SELECT to avoid returning the password hash or heavy columns.
 */
export async function getSharedReviewMeta(token: string): Promise<SharedReviewMeta | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    `SELECT
       share_password_hash IS NOT NULL AS has_password,
       CASE WHEN share_expires_at IS NOT NULL AND share_expires_at < NOW() THEN TRUE ELSE FALSE END AS expired
     FROM reviews
     WHERE share_token = $1 AND deleted_at IS NULL`,
    [token]
  );
  if (result.rows.length === 0) return null;
  return {
    hasPassword: result.rows[0].has_password as boolean,
    expired: result.rows[0].expired as boolean,
  };
}

/** Safe shared review projection (no password hash, no internal fields). */
export interface SharedReviewData {
  id: string;
  status: string;
  provider: string;
  reviewMode: string;
  fileName: string | null;
  createdAt: string;
  feedback: unknown | null;
  userName: string;
  annotations: Annotations;
}

/**
 * Fetch full review data for a shared link — excludes password hash and other
 * sensitive/internal columns. Enforces active (non-expired) token in the query.
 */
export async function getSharedReviewFull(token: string): Promise<SharedReviewData | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    `SELECT id, status, provider, review_mode, file_name, created_at,
            feedback, user_name, annotations
     FROM reviews
     WHERE share_token = $1
       AND (share_expires_at IS NULL OR share_expires_at > NOW())
       AND deleted_at IS NULL`,
    [token]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const rawMode = row.review_mode as string | null;
  return {
    id: row.id as string,
    status: row.status as string,
    provider: row.provider as string,
    reviewMode: rawMode === "thesis" ? "thesis" : "proposal",
    fileName: (row.file_name as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    feedback: row.feedback ?? null,
    userName: row.user_name as string,
    annotations: (row.annotations as Annotations) ?? {},
  };
}

// ---------------------------------------------------------------------------
// Annotation operations
// ---------------------------------------------------------------------------

/**
 * Atomically read-modify-write the annotations JSONB column using a row lock.
 * The `mergeFn` receives the current annotations and returns the new value.
 * Uses SELECT ... FOR UPDATE to prevent lost updates from concurrent writes.
 */
async function mergeAnnotations(
  reviewId: string,
  mergeFn: (current: Annotations) => Annotations
): Promise<Annotations> {
  if (!pool) return {};
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      "SELECT annotations FROM reviews WHERE id = $1 FOR UPDATE",
      [reviewId]
    );
    const current: Annotations = (res.rows[0]?.annotations as Annotations) ?? {};
    const merged = mergeFn(current);
    await client.query(
      "UPDATE reviews SET annotations = $1::jsonb, updated_at = NOW() WHERE id = $2",
      [JSON.stringify(merged), reviewId]
    );
    await client.query("COMMIT");
    return merged;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Save annotation statuses for a review.
 * Merges client-sent status values with existing comments from DB.
 * Only the `status` and `updatedAt` fields from `statusUpdates` are used;
 * any `comments` in existing entries are preserved.
 */
export async function saveAnnotations(
  reviewId: string,
  statusUpdates: Annotations
): Promise<void> {
  await mergeAnnotations(reviewId, (current) => {
    const result: Annotations = {};

    // Preserve comment-only entries not in statusUpdates
    for (const [key, entry] of Object.entries(current)) {
      if (entry.comments?.length && !(key in statusUpdates)) {
        result[key] = { updatedAt: entry.updatedAt, comments: entry.comments };
      }
    }

    // Apply status updates, preserving existing comments
    for (const [key, update] of Object.entries(statusUpdates)) {
      const existing = current[key];
      result[key] = {
        status: update.status,
        updatedAt: update.updatedAt,
        ...(existing?.comments?.length ? { comments: existing.comments } : {}),
      };
    }

    return result;
  });
}

/**
 * Add a comment to a specific finding. Returns the updated annotations.
 */
export async function addComment(
  reviewId: string,
  findingIndex: string,
  comment: Comment
): Promise<Annotations> {
  return mergeAnnotations(reviewId, (current) => {
    const entry = current[findingIndex] ?? { updatedAt: new Date().toISOString() };
    const comments = [...(entry.comments ?? []), comment];
    return { ...current, [findingIndex]: { ...entry, comments, updatedAt: new Date().toISOString() } };
  });
}

/**
 * Delete a comment by its ID from a specific finding. Returns the updated annotations.
 */
export async function deleteComment(
  reviewId: string,
  findingIndex: string,
  commentId: string
): Promise<Annotations> {
  return mergeAnnotations(reviewId, (current) => {
    const entry = current[findingIndex];
    if (!entry?.comments) return current;

    const comments = entry.comments.filter((c) => c.id !== commentId);
    // If entry has no status and no remaining comments, remove it entirely
    if (!entry.status && comments.length === 0) {
      const result = { ...current };
      delete result[findingIndex];
      return result;
    }
    return { ...current, [findingIndex]: { ...entry, comments, updatedAt: new Date().toISOString() } };
  });
}

/**
 * Strip authorId from all comments in annotations before sending to clients.
 */
export function sanitizeAnnotations(annotations: Annotations): Annotations {
  const sanitized: Annotations = {};
  for (const [key, entry] of Object.entries(annotations)) {
    if (entry.comments?.length) {
      sanitized[key] = {
        ...entry,
        comments: entry.comments.map((c) => {
          const sanitized = { ...c };
          delete (sanitized as Record<string, unknown>).authorId;
          return sanitized;
        }),
      };
    } else {
      sanitized[key] = entry;
    }
  }
  return sanitized;
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
// Failed reviews
// ---------------------------------------------------------------------------

export interface FailedReviewRow {
  id: string;
  userName: string;
  userEmail: string;
  fileName: string | null;
  provider: string;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
}

export interface FailedReviewsData {
  reviews: FailedReviewRow[];
  totalFailed: number;
  totalReviews: number;
  failureRate: number;
  commonErrors: { error: string; count: number }[];
}

/**
 * Fetch recent failed reviews with summary statistics.
 * Returns null if the pool is absent.
 */
export async function getFailedReviews(): Promise<FailedReviewsData | null> {
  if (!pool) return null;
  await ensureSchema();

  // Run all queries in parallel
  const [failedResult, countsResult, errorsResult] = await Promise.all([
    pool.query(
      `SELECT id, user_name, user_email, file_name, provider, error_message, retry_count, created_at
       FROM reviews
       WHERE status = 'error' AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 50`
    ),
    pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'error') AS failed
       FROM reviews WHERE deleted_at IS NULL`
    ),
    pool.query(
      `SELECT error_message, COUNT(*) AS cnt
       FROM reviews
       WHERE status = 'error' AND error_message IS NOT NULL AND deleted_at IS NULL
       GROUP BY error_message
       ORDER BY cnt DESC
       LIMIT 5`
    ),
  ]);

  const total = Number(countsResult.rows[0].total);
  const failed = Number(countsResult.rows[0].failed);

  return {
    reviews: failedResult.rows.map((row) => ({
      id: row.id as string,
      userName: row.user_name as string,
      userEmail: row.user_email as string,
      fileName: (row.file_name as string) ?? null,
      provider: row.provider as string,
      errorMessage: (row.error_message as string) ?? null,
      retryCount: Number(row.retry_count ?? 0),
      createdAt: (row.created_at as Date).toISOString(),
    })),
    totalFailed: failed,
    totalReviews: total,
    failureRate: total > 0 ? Math.round((failed / total) * 1000) / 10 : 0,
    commonErrors: errorsResult.rows.map((row) => ({
      error: row.error_message as string,
      count: Number(row.cnt),
    })),
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
      SELECT status, COUNT(*) AS cnt FROM reviews WHERE deleted_at IS NULL GROUP BY status
    ),
    provider_counts AS (
      SELECT provider, COUNT(*) AS cnt FROM reviews WHERE deleted_at IS NULL GROUP BY provider
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
        AND r.deleted_at IS NULL
      GROUP BY ds.day ORDER BY ds.day
    ),

    completed_reviews AS (
      SELECT id,
        CASE
          WHEN feedback IS NOT NULL AND jsonb_typeof(feedback->'findings') = 'array'
          THEN feedback->'findings'
          ELSE '[]'::jsonb
        END AS findings
      FROM reviews WHERE status = 'done' AND deleted_at IS NULL
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
      FROM reviews WHERE deleted_at IS NULL GROUP BY user_id ORDER BY cnt DESC LIMIT 5
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

// ---------------------------------------------------------------------------
// Notification operations
// ---------------------------------------------------------------------------

export interface NotificationRow {
  id: string;
  userId: string;
  reviewId: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

function rowToNotification(row: Record<string, unknown>): NotificationRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    reviewId: row.review_id as string,
    type: row.type as string,
    message: row.message as string,
    read: row.read as boolean,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/** Insert a notification for a user. */
export async function insertNotification(notification: {
  userId: string;
  reviewId: string;
  type: string;
  message: string;
}): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  await pool.query(
    `INSERT INTO notifications (user_id, review_id, type, message)
     VALUES ($1, $2, $3, $4)`,
    [notification.userId, notification.reviewId, notification.type, notification.message]
  );
}

/** Get unread notifications for a user, most recent first. */
export async function getUnreadNotifications(
  userId: string,
  limit = 20
): Promise<NotificationRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM notifications
     WHERE user_id = $1 AND read = FALSE
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map(rowToNotification);
}

/** Mark a single notification as read. Returns true if updated. */
export async function markNotificationRead(
  id: string,
  userId: string
): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Mark all notifications as read for a user. */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  await pool.query(
    `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
    [userId]
  );
}

// ---------------------------------------------------------------------------
// Review templates
// ---------------------------------------------------------------------------

export interface ReviewTemplateRow {
  id: string;
  name: string;
  description: string;
  checkGroups: CheckGroupId[];
  reviewMode: ReviewMode;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function rowToTemplate(row: Record<string, unknown>): ReviewTemplateRow {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    checkGroups: row.check_groups as CheckGroupId[],
    reviewMode: (row.review_mode as string) === "thesis" ? "thesis" : "proposal",
    createdBy: row.created_by as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/** Seed default templates if the table is empty. */
async function seedDefaultTemplates(): Promise<void> {
  if (!pool) return;
  const count = await pool.query("SELECT COUNT(*) FROM review_templates");
  if (Number(count.rows[0].count) > 0) return;

  await pool.query(
    `INSERT INTO review_templates (name, description, check_groups, review_mode, created_by) VALUES
      ('Full Proposal Review', 'All checks for a thesis proposal', $1, 'proposal', 'system'),
      ('Quick Proposal Check', 'Structure and writing checks only', $2, 'proposal', 'system'),
      ('Thesis Review', 'Comprehensive thesis review with all checks', $3, 'thesis', 'system')`,
    [
      JSON.stringify(["structure", "problem-motivation-objectives", "bibliography", "figures", "writing-style", "writing-structure", "writing-formatting", "ai-transparency", "schedule"]),
      JSON.stringify(["structure", "writing-style", "writing-structure", "writing-formatting"]),
      JSON.stringify(["structure", "problem-motivation-objectives", "bibliography", "figures", "writing-style", "writing-structure", "writing-formatting", "ai-transparency", "schedule", "related-work", "methodology", "evaluation"]),
    ]
  );
}

export async function getReviewTemplates(): Promise<ReviewTemplateRow[]> {
  if (!pool) return [];
  await ensureSchema();
  await seedDefaultTemplates();
  const result = await pool.query(
    "SELECT * FROM review_templates ORDER BY created_at ASC"
  );
  return result.rows.map(rowToTemplate);
}

export async function getReviewTemplateById(id: string): Promise<ReviewTemplateRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query("SELECT * FROM review_templates WHERE id = $1", [id]);
  if (result.rows.length === 0) return null;
  return rowToTemplate(result.rows[0]);
}

export async function createReviewTemplate(template: {
  name: string;
  description: string;
  checkGroups: CheckGroupId[];
  reviewMode: ReviewMode;
  createdBy: string;
}): Promise<ReviewTemplateRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO review_templates (name, description, check_groups, review_mode, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [template.name, template.description, JSON.stringify(template.checkGroups), template.reviewMode, template.createdBy]
  );
  return rowToTemplate(result.rows[0]);
}

export async function updateReviewTemplate(
  id: string,
  updates: { name: string; description: string; checkGroups: CheckGroupId[]; reviewMode: ReviewMode }
): Promise<ReviewTemplateRow | null> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `UPDATE review_templates
     SET name = $2, description = $3, check_groups = $4, review_mode = $5, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, updates.name, updates.description, JSON.stringify(updates.checkGroups), updates.reviewMode]
  );
  if (result.rows.length === 0) return null;
  return rowToTemplate(result.rows[0]);
}

export async function deleteReviewTemplate(id: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query("DELETE FROM review_templates WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Check performance metrics
// ---------------------------------------------------------------------------

export async function insertCheckPerformance(entry: {
  reviewId: string;
  checkGroup: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  status: "done" | "error";
}): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  await pool.query(
    `INSERT INTO check_performance (review_id, check_group, duration_ms, prompt_tokens, completion_tokens, reasoning_tokens, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [entry.reviewId, entry.checkGroup, entry.durationMs, entry.promptTokens, entry.completionTokens, entry.reasoningTokens, entry.status]
  );
}

export interface CheckGroupMetrics {
  checkGroup: string;
  avgDurationMs: number;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  avgReasoningTokens: number;
  totalRuns: number;
  errorCount: number;
  failureRate: number;
}

/**
 * Aggregate check group performance metrics.
 * Returns per-group averages for duration, tokens, and failure rate.
 */
export async function getCheckGroupMetrics(): Promise<CheckGroupMetrics[] | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(`
    SELECT
      check_group,
      ROUND(AVG(duration_ms)) AS avg_duration_ms,
      ROUND(AVG(prompt_tokens)) AS avg_prompt_tokens,
      ROUND(AVG(completion_tokens)) AS avg_completion_tokens,
      ROUND(AVG(reasoning_tokens)) AS avg_reasoning_tokens,
      COUNT(*) AS total_runs,
      COUNT(*) FILTER (WHERE status = 'error') AS error_count
    FROM check_performance
    GROUP BY check_group
    ORDER BY check_group
  `);

  return result.rows.map((row) => {
    const total = Number(row.total_runs);
    const errors = Number(row.error_count);
    return {
      checkGroup: row.check_group as string,
      avgDurationMs: Number(row.avg_duration_ms),
      avgPromptTokens: Number(row.avg_prompt_tokens),
      avgCompletionTokens: Number(row.avg_completion_tokens),
      avgReasoningTokens: Number(row.avg_reasoning_tokens),
      totalRuns: total,
      errorCount: errors,
      failureRate: total > 0 ? Math.round((errors / total) * 1000) / 10 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Webhook operations
// ---------------------------------------------------------------------------

export type WebhookEvent = "review.completed" | "review.failed" | "annotation.updated";

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "review.completed",
  "review.failed",
  "annotation.updated",
];

export interface WebhookRow {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

function rowToWebhook(row: Record<string, unknown>): WebhookRow {
  return {
    id: row.id as string,
    url: row.url as string,
    events: row.events as WebhookEvent[],
    secret: row.secret as string,
    active: row.active as boolean,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/** List all webhooks. */
export async function listWebhooks(): Promise<WebhookRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM webhooks ORDER BY created_at DESC"
  );
  return result.rows.map(rowToWebhook);
}

/** Insert a new webhook. Returns the created row. */
export async function insertWebhook(webhook: {
  url: string;
  events: WebhookEvent[];
  secret: string;
  createdBy: string;
}): Promise<WebhookRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO webhooks (url, events, secret, created_by)
     VALUES ($1, $2::jsonb, $3, $4)
     RETURNING *`,
    [webhook.url, JSON.stringify(webhook.events), webhook.secret, webhook.createdBy]
  );
  return rowToWebhook(result.rows[0]);
}

/** Update an existing webhook. Returns the updated row or null if not found. */
export async function updateWebhook(
  id: string,
  updates: { url?: string; events?: WebhookEvent[]; secret?: string; active?: boolean }
): Promise<WebhookRow | null> {
  if (!pool) return null;
  await ensureSchema();

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.url !== undefined) {
    sets.push(`url = $${idx++}`);
    params.push(updates.url);
  }
  if (updates.events !== undefined) {
    sets.push(`events = $${idx++}::jsonb`);
    params.push(JSON.stringify(updates.events));
  }
  if (updates.secret !== undefined) {
    sets.push(`secret = $${idx++}`);
    params.push(updates.secret);
  }
  if (updates.active !== undefined) {
    sets.push(`active = $${idx++}`);
    params.push(updates.active);
  }

  if (sets.length === 0) return null;

  params.push(id);
  const result = await pool.query(
    `UPDATE webhooks SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );
  if (result.rows.length === 0) return null;
  return rowToWebhook(result.rows[0]);
}

/** Delete a webhook. Returns true if deleted. */
export async function deleteWebhook(id: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query("DELETE FROM webhooks WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Get all active webhooks subscribed to a given event. */
export async function getActiveWebhooksForEvent(
  event: WebhookEvent
): Promise<WebhookRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM webhooks WHERE active = TRUE AND events @> $1::jsonb`,
    [JSON.stringify([event])]
  );
  return result.rows.map(rowToWebhook);
}

// ---------------------------------------------------------------------------
// Pinned reviews (bookmarks)
// ---------------------------------------------------------------------------

/**
 * Pin a review for a user. Idempotent — if already pinned, does nothing.
 * Returns true if a new pin was created, false if already existed.
 */
export async function pinReview(userId: string, reviewId: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO pinned_reviews (user_id, review_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, review_id) DO NOTHING`,
    [userId, reviewId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Unpin a review for a user. Returns true if the pin was removed.
 */
export async function unpinReview(userId: string, reviewId: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    `DELETE FROM pinned_reviews WHERE user_id = $1 AND review_id = $2`,
    [userId, reviewId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get the set of pinned review IDs for a user.
 */
export async function getPinnedReviewIds(userId: string): Promise<Set<string>> {
  if (!pool) return new Set();
  await ensureSchema();
  const result = await pool.query(
    `SELECT review_id FROM pinned_reviews WHERE user_id = $1`,
    [userId]
  );
  return new Set(result.rows.map((row) => row.review_id as string));
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  reviewId: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

function rowToAuditLog(row: Record<string, unknown>): AuditLogRow {
  return {
    id: row.id as string,
    reviewId: row.review_id as string,
    userId: (row.user_id as string) ?? null,
    userEmail: (row.user_email as string) ?? null,
    action: row.action as string,
    details: (row.details as Record<string, unknown>) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/**
 * Log an audit event. Designed to be called fire-and-forget — errors are
 * caught and logged but never thrown to avoid impacting main operations.
 */
export async function logAuditEvent(
  reviewId: string,
  userId: string | null,
  userEmail: string | null,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  if (!pool) return;
  try {
    await ensureSchema();
    await pool.query(
      `INSERT INTO review_audit_log (review_id, user_id, user_email, action, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [reviewId, userId, userEmail, action, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error("[audit] Failed to log event:", err);
  }
}

/**
 * Get the audit log for a specific review, ordered newest-first.
 */
export async function getAuditLog(reviewId: string): Promise<AuditLogRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM review_audit_log WHERE review_id = $1 ORDER BY created_at DESC`,
    [reviewId]
  );
  return result.rows.map(rowToAuditLog);
}

// ---------------------------------------------------------------------------
// Annotation history & conflict detection
// ---------------------------------------------------------------------------

/**
 * Log an annotation status change to the history table.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function logAnnotationChange(
  reviewId: string,
  findingIndex: number,
  userId: string,
  userName: string | null,
  status: string
): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  try {
    await pool.query(
      `INSERT INTO annotation_history (review_id, finding_index, user_id, user_name, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [reviewId, findingIndex, userId, userName, status]
    );
  } catch (err) {
    console.error("[db] logAnnotationChange failed:", err);
  }
}

/**
 * Find findings where different users have set different annotation statuses.
 * Returns only findings with actual conflicts (2+ users, differing statuses).
 * For each conflicting finding, returns the most recent entry per user.
 */
export async function getAnnotationConflicts(
  reviewId: string
): Promise<AnnotationConflict[]> {
  if (!pool) return [];
  await ensureSchema();

  // For each (review, finding, user), pick the latest entry. Then find findings
  // where at least two distinct users have different statuses.
  const result = await pool.query(
    `WITH latest_per_user AS (
       SELECT DISTINCT ON (finding_index, user_id)
         finding_index, user_id, user_name, status, created_at
       FROM annotation_history
       WHERE review_id = $1
       ORDER BY finding_index, user_id, created_at DESC
     ),
     conflicting_findings AS (
       SELECT finding_index
       FROM latest_per_user
       GROUP BY finding_index
       HAVING COUNT(DISTINCT status) > 1
     )
     SELECT lpu.finding_index, lpu.user_id, lpu.user_name, lpu.status, lpu.created_at
     FROM latest_per_user lpu
     INNER JOIN conflicting_findings cf ON cf.finding_index = lpu.finding_index
     ORDER BY lpu.finding_index, lpu.created_at DESC`,
    [reviewId]
  );

  // Group rows by finding_index
  const map = new Map<number, AnnotationConflict["entries"]>();
  for (const row of result.rows) {
    const fi = row.finding_index as number;
    if (!map.has(fi)) map.set(fi, []);
    map.get(fi)!.push({
      userId: row.user_id as string,
      userName: (row.user_name as string) ?? null,
      status: row.status as string,
      createdAt: (row.created_at as Date).toISOString(),
    });
  }

  return Array.from(map.entries()).map(([findingIndex, entries]) => ({
    findingIndex,
    entries,
  }));
}

// ---------------------------------------------------------------------------
// Previous reviews for the same file (improvement tracking)
// ---------------------------------------------------------------------------

/**
 * Returns previous completed reviews of the same file by the same user,
 * ordered by created_at DESC. Excludes the given review ID and soft-deleted rows.
 * Only returns reviews that have feedback (status = 'done').
 */
export async function getPreviousReviewsForFile(
  userId: string,
  fileName: string,
  excludeId: string
): Promise<ReviewRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM reviews
     WHERE user_id = $1
       AND file_name = $2
       AND id != $3
       AND status = 'done'
       AND feedback IS NOT NULL
       AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [userId, fileName, excludeId]
  );
  return result.rows.map(rowToReview);
}
