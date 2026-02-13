import "server-only";
import pg from "pg";
import type { AppRole } from "@/lib/auth/roles";
import type { ProviderType, ReviewMode, CheckGroupId, Annotations, Comment, AnnotationConflict, ThreadStatus, WorkflowStatus, FindingCategory, Finding, MergedFeedback } from "@/types/review";
import { FINDING_CATEGORY_VALUES } from "@/types/review";

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

      -- Review notes (free-text supervisor observations)
      CREATE TABLE IF NOT EXISTS review_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_review_notes_user_review
        ON review_notes(review_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_review_notes_review
        ON review_notes(review_id, created_at ASC);

      -- Severity weights (admin-configurable scoring)
      CREATE TABLE IF NOT EXISTS severity_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        severity TEXT UNIQUE NOT NULL,
        weight INT NOT NULL,
        color TEXT NOT NULL,
        label TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Seed default severity weights
      INSERT INTO severity_config (severity, weight, color, label) VALUES
        ('critical', 10, 'red', 'Critical'),
        ('major', 5, 'orange', 'Major'),
        ('minor', 2, 'yellow', 'Minor'),
        ('suggestion', 1, 'blue', 'Suggestion')
      ON CONFLICT (severity) DO NOTHING;

      -- Prompt snippets (reusable prompt fragments)
      CREATE TABLE IF NOT EXISTS prompt_snippets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_prompt_snippets_category_name
        ON prompt_snippets(category, name);

      -- Custom check group prompts (admin overrides for hardcoded prompts)
      CREATE TABLE IF NOT EXISTS custom_prompts (
        check_group TEXT PRIMARY KEY,
        system_prompt TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active BOOLEAN NOT NULL DEFAULT true
      );

      -- Review tags (user-applied labels for organizing reviews)
      CREATE TABLE IF NOT EXISTS review_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(review_id, tag)
      );

      CREATE INDEX IF NOT EXISTS idx_review_tags_review
        ON review_tags(review_id);
      CREATE INDEX IF NOT EXISTS idx_review_tags_tag
        ON review_tags(tag);

      -- Check group display order (admin-configurable)
      CREATE TABLE IF NOT EXISTS check_group_order (
        check_group TEXT PRIMARY KEY,
        display_order INT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Seed with default order matching CHECK_GROUP_IDS array index
      INSERT INTO check_group_order (check_group, display_order) VALUES
        ('structure', 0),
        ('problem-motivation-objectives', 1),
        ('bibliography', 2),
        ('figures', 3),
        ('writing-style', 4),
        ('writing-structure', 5),
        ('writing-formatting', 6),
        ('ai-transparency', 7),
        ('schedule', 8),
        ('related-work', 9),
        ('methodology', 10),
        ('evaluation', 11)
      ON CONFLICT (check_group) DO NOTHING;

      -- Review assignments (supervisor assigns reviews to users)
      CREATE TABLE IF NOT EXISTS review_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        assigned_to TEXT NOT NULL,
        assigned_by TEXT NOT NULL,
        assigned_by_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_review_assignments_review
        ON review_assignments(review_id);
      CREATE INDEX IF NOT EXISTS idx_review_assignments_user
        ON review_assignments(assigned_to, created_at DESC);

      -- Workflow status for review lifecycle
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'draft';

      -- Finding resolutions (state machine for tracking action on each finding)
      CREATE TABLE IF NOT EXISTS finding_resolutions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        finding_index INT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressing', 'resolved', 'dismissed')),
        changed_by TEXT NOT NULL,
        changed_by_name TEXT,
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(review_id, finding_index, created_at)
      );

      CREATE INDEX IF NOT EXISTS idx_finding_resolutions_review
        ON finding_resolutions(review_id);

      -- Token usage tracking (per-review, per-check-group cost attribution)
      CREATE TABLE IF NOT EXISTS token_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        check_group TEXT NOT NULL,
        provider TEXT NOT NULL,
        input_tokens INT NOT NULL DEFAULT 0,
        output_tokens INT NOT NULL DEFAULT 0,
        reasoning_tokens INT NOT NULL DEFAULT 0,
        estimated_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_token_usage_review
        ON token_usage(review_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_created
        ON token_usage(created_at);

      -- Review versions (link reviews as sequential versions of the same document)
      CREATE TABLE IF NOT EXISTS review_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL,
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        version_number INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(group_id, version_number),
        UNIQUE(review_id)
      );

      CREATE INDEX IF NOT EXISTS idx_review_versions_group
        ON review_versions(group_id);
      CREATE INDEX IF NOT EXISTS idx_review_versions_review
        ON review_versions(review_id);

      -- Finding SLA deadlines (supervisor-set deadlines for finding resolutions)
      CREATE TABLE IF NOT EXISTS finding_sla (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        finding_index INT NOT NULL,
        deadline TIMESTAMPTZ NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        set_by TEXT NOT NULL,
        set_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(review_id, finding_index)
      );

      CREATE INDEX IF NOT EXISTS idx_finding_sla_review
        ON finding_sla(review_id);
      CREATE INDEX IF NOT EXISTS idx_finding_sla_deadline
        ON finding_sla(deadline);

      -- Finding patterns (recurring issue detection across reviews)
      CREATE TABLE IF NOT EXISTS finding_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pattern_text TEXT NOT NULL,
        category TEXT NOT NULL,
        occurrence_count INT NOT NULL DEFAULT 1,
        example_review_ids TEXT[] DEFAULT '{}',
        suggested_template TEXT,
        is_template BOOLEAN NOT NULL DEFAULT false,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_finding_patterns_category ON finding_patterns(category);

      -- Severity overrides (supervisor reclassification audit trail)
      CREATE TABLE IF NOT EXISTS severity_overrides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        finding_index INT NOT NULL,
        original_severity TEXT NOT NULL,
        new_severity TEXT NOT NULL,
        reason TEXT,
        changed_by TEXT NOT NULL,
        changed_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_severity_overrides_review
        ON severity_overrides(review_id);

      -- Proposal relationships (links between related proposals)
      CREATE TABLE IF NOT EXISTS proposal_relationships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        target_review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        relationship_type TEXT NOT NULL CHECK (relationship_type IN ('similar_topic', 'shared_advisor', 'builds_upon', 'contradicts', 'related')),
        notes TEXT,
        created_by TEXT NOT NULL,
        created_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(source_review_id, target_review_id, relationship_type)
      );

      CREATE INDEX IF NOT EXISTS idx_proposal_rel_source ON proposal_relationships(source_review_id);
      CREATE INDEX IF NOT EXISTS idx_proposal_rel_target ON proposal_relationships(target_review_id);

      -- Readiness checklists (pre-submission self-assessment)
      CREATE TABLE IF NOT EXISTS readiness_checklists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        file_name TEXT,
        checks JSONB NOT NULL DEFAULT '[]',
        passed_count INT NOT NULL DEFAULT 0,
        total_count INT NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT false,
        review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_readiness_user ON readiness_checklists(user_id);

      -- Finding approvals (advisor approval workflow for individual findings)
      CREATE TABLE IF NOT EXISTS finding_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        finding_index INT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('approved', 'disputed', 'needs_action')),
        advisor_comment TEXT,
        approved_by TEXT NOT NULL,
        approved_by_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_finding_approvals_review ON finding_approvals(review_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_finding_approvals_unique ON finding_approvals(review_id, finding_index);

      -- Submission deadlines (calendar & risk analysis)
      CREATE TABLE IF NOT EXISTS submission_deadlines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        deadline TIMESTAMPTZ NOT NULL,
        description TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_deadlines_date ON submission_deadlines(deadline);

      -- Peer review pairings (complementary strength matching)
      CREATE TABLE IF NOT EXISTS peer_pairings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_a_id TEXT NOT NULL,
        student_b_id TEXT NOT NULL,
        rationale TEXT NOT NULL,
        strength_area TEXT NOT NULL,
        weakness_area TEXT NOT NULL,
        score NUMERIC(5,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(student_a_id, student_b_id)
      );
      CREATE INDEX IF NOT EXISTS idx_peer_pairings_students ON peer_pairings(student_a_id, student_b_id);

      -- Revision summaries (change summaries between two review versions)
      CREATE TABLE IF NOT EXISTS revision_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        old_review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        new_review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        fixed_count INT NOT NULL DEFAULT 0,
        new_count INT NOT NULL DEFAULT 0,
        persistent_count INT NOT NULL DEFAULT 0,
        summary JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(old_review_id, new_review_id)
      );
      CREATE INDEX IF NOT EXISTS idx_revision_summaries_new ON revision_summaries(new_review_id);
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
  workflowStatus: WorkflowStatus;
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
    workflowStatus: (row.workflow_status as WorkflowStatus) ?? "draft",
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
  "workflow_status",
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
 * Represents a top-level comment with its nested replies.
 */
export interface CommentThread {
  comment: Comment;
  replies: Comment[];
}

/**
 * Get comments for a finding organized into threads.
 * Returns top-level comments (no parentId) with their replies nested underneath,
 * ordered by creation time (oldest first for both threads and replies).
 */
export async function getThreadedComments(
  reviewId: string,
  findingIndex: string
): Promise<CommentThread[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT annotations FROM reviews WHERE id = $1",
    [reviewId]
  );
  if (result.rows.length === 0) return [];

  const annotations: Annotations = (result.rows[0].annotations as Annotations) ?? {};
  const entry = annotations[findingIndex];
  if (!entry?.comments?.length) return [];

  const comments = entry.comments;
  const topLevel = comments.filter((c) => !c.parentId);
  const replyMap = new Map<string, Comment[]>();

  for (const c of comments) {
    if (c.parentId) {
      if (!replyMap.has(c.parentId)) replyMap.set(c.parentId, []);
      replyMap.get(c.parentId)!.push(c);
    }
  }

  // Sort replies by creation time (oldest first)
  for (const replies of replyMap.values()) {
    replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // Sort threads by creation time (oldest first)
  topLevel.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return topLevel.map((comment) => ({
    comment,
    replies: replyMap.get(comment.id) ?? [],
  }));
}

/**
 * Resolve or reopen a top-level comment's thread.
 * Only top-level comments (no parentId) can have their thread status changed.
 * Returns the updated annotations.
 */
export async function resolveThread(
  reviewId: string,
  findingIndex: string,
  commentId: string,
  userId: string,
  userName: string,
  status: ThreadStatus
): Promise<Annotations> {
  return mergeAnnotations(reviewId, (current) => {
    const entry = current[findingIndex];
    if (!entry?.comments) return current;

    const comments = entry.comments.map((c) => {
      if (c.id !== commentId) return c;
      // Only allow resolving top-level comments
      if (c.parentId) return c;
      if (status === "resolved") {
        return {
          ...c,
          threadStatus: "resolved" as ThreadStatus,
          resolvedBy: userId,
          resolvedByName: userName,
          resolvedAt: new Date().toISOString(),
        };
      }
      // Reopen: clear resolution fields
      return {
        id: c.id,
        text: c.text,
        authorName: c.authorName,
        authorId: c.authorId,
        createdAt: c.createdAt,
        ...(c.parentId ? { parentId: c.parentId } : {}),
        threadStatus: "open" as ThreadStatus,
      };
    });

    return { ...current, [findingIndex]: { ...entry, comments, updatedAt: new Date().toISOString() } };
  });
}

/**
 * Strip internal-only fields (authorId, resolvedBy) from all comments
 * in annotations before sending to clients.
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
          delete (sanitized as Record<string, unknown>).resolvedBy;
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
// Analytics export (date-range filtered)
// ---------------------------------------------------------------------------

export interface AnalyticsExportRow {
  reviewId: string;
  userEmail: string;
  fileName: string | null;
  status: string;
  provider: string;
  reviewMode: string;
  findingCount: number;
  createdAt: string;
}

/**
 * Returns review rows for CSV/JSON export with optional date-range filtering.
 * Only includes non-deleted reviews. Ordered by created_at DESC.
 */
export async function getAnalyticsForDateRange(
  startDate?: string,
  endDate?: string
): Promise<AnalyticsExportRow[]> {
  if (!pool) return [];
  await ensureSchema();

  const conditions: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (startDate) {
    conditions.push(`created_at >= $${paramIdx++}::timestamptz`);
    params.push(startDate);
  }
  if (endDate) {
    // Include the entire end date by adding a day
    conditions.push(`created_at < ($${paramIdx++}::date + 1)::timestamptz`);
    params.push(endDate);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const result = await pool.query(
    `SELECT
       id,
       user_email,
       file_name,
       status,
       provider,
       review_mode,
       CASE
         WHEN feedback IS NOT NULL AND jsonb_typeof(feedback->'findings') = 'array'
         THEN jsonb_array_length(feedback->'findings')
         ELSE 0
       END AS finding_count,
       created_at
     FROM reviews ${where}
     ORDER BY created_at DESC`,
    params
  );

  return result.rows.map((row) => ({
    reviewId: row.id as string,
    userEmail: row.user_email as string,
    fileName: (row.file_name as string) ?? null,
    status: row.status as string,
    provider: row.provider as string,
    reviewMode: (row.review_mode as string) ?? "proposal",
    findingCount: parseInt(row.finding_count, 10),
    createdAt: (row.created_at as Date).toISOString(),
  }));
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
// Supervisor dashboard queries
// ---------------------------------------------------------------------------

export interface SupervisorOverview {
  totalReviews: number;
  avgFindingsPerReview: number;
  mostCommonSeverity: string | null;
  reviewsNeedingAttention: number;
  severityDistribution: { severity: string; count: number }[];
}

/**
 * Aggregate stats for the supervisor dashboard.
 * Returns total reviews, avg findings, severity distribution,
 * most common severity, and count of reviews with unresolved critical findings.
 */
export async function getSupervisorOverview(): Promise<SupervisorOverview | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(`
    WITH completed AS (
      SELECT id, feedback
      FROM reviews
      WHERE status = 'done' AND deleted_at IS NULL
        AND feedback IS NOT NULL
        AND jsonb_typeof(feedback->'findings') = 'array'
    ),
    finding_rows AS (
      SELECT c.id AS review_id, f.value AS finding
      FROM completed c, jsonb_array_elements(c.feedback->'findings') AS f(value)
    ),
    severity_counts AS (
      SELECT finding->>'severity' AS severity, COUNT(*) AS cnt
      FROM finding_rows
      GROUP BY finding->>'severity'
    ),
    review_finding_counts AS (
      SELECT review_id, COUNT(*) AS finding_count
      FROM finding_rows
      GROUP BY review_id
    ),
    reviews_with_critical AS (
      SELECT DISTINCT fr.review_id
      FROM finding_rows fr
      LEFT JOIN reviews r ON r.id = fr.review_id
      WHERE fr.finding->>'severity' = 'critical'
        AND (
          r.annotations IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM jsonb_each(r.annotations) AS a(key, val)
            WHERE a.val->>'status' IN ('dismissed', 'fixed')
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(r.feedback->'findings') WITH ORDINALITY AS f(val, idx)
                WHERE (idx - 1)::text = a.key
                  AND f.val->>'severity' = 'critical'
              )
          )
        )
    )
    SELECT json_build_object(
      'totalReviews', (SELECT COUNT(*) FROM reviews WHERE deleted_at IS NULL),
      'avgFindings', (SELECT COALESCE(ROUND(AVG(finding_count), 1), 0) FROM review_finding_counts),
      'reviewsNeedingAttention', (SELECT COUNT(*) FROM reviews_with_critical),
      'severityDistribution', COALESCE(
        (SELECT json_agg(json_build_object('severity', severity, 'count', cnt) ORDER BY cnt DESC)
         FROM severity_counts),
        '[]'::json
      )
    ) AS data
  `);

  const raw = result.rows[0].data;
  const severityDist = (raw.severityDistribution as { severity: string; count: string }[]).map(
    (r) => ({ severity: r.severity, count: Number(r.count) })
  );

  return {
    totalReviews: Number(raw.totalReviews),
    avgFindingsPerReview: Number(raw.avgFindings),
    mostCommonSeverity: severityDist.length > 0 ? severityDist[0].severity : null,
    reviewsNeedingAttention: Number(raw.reviewsNeedingAttention),
    severityDistribution: severityDist,
  };
}

export interface StudentReviewSummary {
  id: string;
  fileName: string | null;
  status: string;
  provider: string;
  reviewMode: string;
  createdAt: string;
  findingCount: number;
  overallAssessment: string | null;
}

export interface StudentGroup {
  userId: string;
  userEmail: string;
  userName: string;
  reviewCount: number;
  lastReviewDate: string;
  avgFindings: number;
  reviews: StudentReviewSummary[];
}

/**
 * Returns reviews grouped by user for the supervisor dashboard.
 * Each group includes per-student stats and their individual reviews.
 */
export async function getReviewsByUser(): Promise<StudentGroup[]> {
  if (!pool) return [];
  await ensureSchema();

  const result = await pool.query(`
    SELECT
      r.id,
      r.user_id,
      r.user_email,
      r.user_name,
      r.file_name,
      r.status,
      r.provider,
      r.review_mode,
      r.created_at,
      CASE
        WHEN r.feedback IS NOT NULL AND jsonb_typeof(r.feedback->'findings') = 'array'
        THEN jsonb_array_length(r.feedback->'findings')
        ELSE 0
      END AS finding_count,
      r.feedback->>'overallAssessment' AS overall_assessment
    FROM reviews r
    WHERE r.deleted_at IS NULL
    ORDER BY r.user_email, r.created_at DESC
  `);

  const groupMap = new Map<string, StudentGroup>();

  for (const row of result.rows) {
    const userId = row.user_id as string;
    if (!groupMap.has(userId)) {
      groupMap.set(userId, {
        userId,
        userEmail: row.user_email as string,
        userName: row.user_name as string,
        reviewCount: 0,
        lastReviewDate: (row.created_at as Date).toISOString(),
        avgFindings: 0,
        reviews: [],
      });
    }

    const group = groupMap.get(userId)!;
    group.reviewCount++;
    group.reviews.push({
      id: row.id as string,
      fileName: (row.file_name as string) ?? null,
      status: row.status as string,
      provider: row.provider as string,
      reviewMode: (row.review_mode as string) ?? "proposal",
      createdAt: (row.created_at as Date).toISOString(),
      findingCount: parseInt(row.finding_count, 10),
      overallAssessment: (row.overall_assessment as string) ?? null,
    });
  }

  // Compute avg findings per student
  for (const group of groupMap.values()) {
    const doneReviews = group.reviews.filter((r) => r.status === "done");
    if (doneReviews.length > 0) {
      const totalFindings = doneReviews.reduce((sum, r) => sum + r.findingCount, 0);
      group.avgFindings = Math.round((totalFindings / doneReviews.length) * 10) / 10;
    }
  }

  // Sort by most recent review first
  return Array.from(groupMap.values()).sort(
    (a, b) => new Date(b.lastReviewDate).getTime() - new Date(a.lastReviewDate).getTime()
  );
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

// ---------------------------------------------------------------------------
// Review notes (free-text supervisor observations)
// ---------------------------------------------------------------------------

export interface ReviewNoteRow {
  id: string;
  reviewId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function rowToNote(row: Record<string, unknown>): ReviewNoteRow {
  return {
    id: row.id as string,
    reviewId: row.review_id as string,
    userId: row.user_id as string,
    userName: row.user_name as string,
    content: row.content as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/** Get all notes for a review, ordered by creation time. */
export async function getReviewNotes(reviewId: string): Promise<ReviewNoteRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM review_notes WHERE review_id = $1 ORDER BY created_at ASC",
    [reviewId]
  );
  return result.rows.map(rowToNote);
}

/**
 * Create or update the current user's note for a review.
 * Each user can have at most one note per review (upsert by user_id + review_id).
 * Returns the upserted note.
 */
export async function upsertReviewNote(
  reviewId: string,
  userId: string,
  userName: string,
  content: string
): Promise<ReviewNoteRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO review_notes (review_id, user_id, user_name, content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (review_id, user_id) DO UPDATE SET
       content = EXCLUDED.content,
       user_name = EXCLUDED.user_name,
       updated_at = NOW()
     RETURNING *`,
    [reviewId, userId, userName, content]
  );
  return rowToNote(result.rows[0]);
}

/**
 * Delete a note. Only succeeds if the note belongs to the given user.
 * Returns true if the row was deleted.
 */
export async function deleteReviewNote(
  noteId: string,
  userId: string
): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    "DELETE FROM review_notes WHERE id = $1 AND user_id = $2",
    [noteId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Severity weight configuration
// ---------------------------------------------------------------------------

export interface SeverityWeightRow {
  id: string;
  severity: string;
  weight: number;
  color: string;
  label: string;
  updatedAt: string;
}

/**
 * Get all severity weight configurations, ordered by weight descending.
 */
export async function getSeverityWeights(): Promise<SeverityWeightRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM severity_config ORDER BY weight DESC"
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    severity: row.severity as string,
    weight: Number(row.weight),
    color: row.color as string,
    label: row.label as string,
    updatedAt: (row.updated_at as Date).toISOString(),
  }));
}

/**
 * Update the weight for a specific severity level. Returns the updated row.
 */
export async function updateSeverityWeight(
  severity: string,
  weight: number
): Promise<SeverityWeightRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `UPDATE severity_config SET weight = $2, updated_at = NOW()
     WHERE severity = $1
     RETURNING *`,
    [severity, weight]
  );
  if (result.rows.length === 0) {
    throw new Error(`Unknown severity: ${severity}`);
  }
  const row = result.rows[0];
  return {
    id: row.id as string,
    severity: row.severity as string,
    weight: Number(row.weight),
    color: row.color as string,
    label: row.label as string,
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Prompt snippets (reusable prompt fragments)
// ---------------------------------------------------------------------------

export interface PromptSnippetRow {
  id: string;
  name: string;
  content: string;
  category: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function rowToPromptSnippet(row: Record<string, unknown>): PromptSnippetRow {
  return {
    id: row.id as string,
    name: row.name as string,
    content: row.content as string,
    category: row.category as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/** List all prompt snippets, ordered by category then name. */
export async function listPromptSnippets(): Promise<PromptSnippetRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM prompt_snippets ORDER BY category, name"
  );
  return result.rows.map(rowToPromptSnippet);
}

/** Create a new prompt snippet. Returns the created row. */
export async function createPromptSnippet(snippet: {
  name: string;
  content: string;
  category: string;
  createdBy: string;
}): Promise<PromptSnippetRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO prompt_snippets (name, content, category, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [snippet.name, snippet.content, snippet.category, snippet.createdBy]
  );
  return rowToPromptSnippet(result.rows[0]);
}

/** Update an existing prompt snippet. Returns the updated row or null if not found. */
export async function updatePromptSnippet(
  id: string,
  updates: { name: string; content: string; category: string }
): Promise<PromptSnippetRow | null> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `UPDATE prompt_snippets
     SET name = $2, content = $3, category = $4, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, updates.name, updates.content, updates.category]
  );
  if (result.rows.length === 0) return null;
  return rowToPromptSnippet(result.rows[0]);
}

/** Delete a prompt snippet. Returns true if deleted. */
export async function deletePromptSnippet(id: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query("DELETE FROM prompt_snippets WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Fetch multiple prompt snippets by their IDs. */
export async function getPromptSnippetsByIds(ids: string[]): Promise<PromptSnippetRow[]> {
  if (!pool || ids.length === 0) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM prompt_snippets WHERE id = ANY($1) ORDER BY category, name",
    [ids]
  );
  return result.rows.map(rowToPromptSnippet);
}

// ---------------------------------------------------------------------------
// Review tags (user-applied labels for organizing reviews)
// ---------------------------------------------------------------------------

export interface ReviewTagRow {
  id: string;
  reviewId: string;
  tag: string;
  createdBy: string;
  createdAt: string;
}

function rowToTag(row: Record<string, unknown>): ReviewTagRow {
  return {
    id: row.id as string,
    reviewId: row.review_id as string,
    tag: row.tag as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/**
 * Add a tag to a review. Idempotent — if the tag already exists, does nothing.
 * Returns the tag row (existing or newly created).
 */
export async function addTag(
  reviewId: string,
  tag: string,
  userId: string
): Promise<ReviewTagRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO review_tags (review_id, tag, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (review_id, tag) DO UPDATE SET review_id = review_tags.review_id
     RETURNING *`,
    [reviewId, tag, userId]
  );
  return rowToTag(result.rows[0]);
}

/** Remove a tag from a review. Returns true if the tag was removed. */
export async function removeTag(reviewId: string, tag: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    "DELETE FROM review_tags WHERE review_id = $1 AND tag = $2",
    [reviewId, tag]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Get all tags for a single review, ordered by tag name. */
export async function getTagsForReview(reviewId: string): Promise<ReviewTagRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM review_tags WHERE review_id = $1 ORDER BY tag",
    [reviewId]
  );
  return result.rows.map(rowToTag);
}

/**
 * Batch get tags for multiple reviews.
 * Returns a map of reviewId -> tags.
 */
export async function getTagsForReviews(
  reviewIds: string[]
): Promise<Map<string, ReviewTagRow[]>> {
  const map = new Map<string, ReviewTagRow[]>();
  if (!pool || reviewIds.length === 0) return map;
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM review_tags WHERE review_id = ANY($1) ORDER BY tag",
    [reviewIds]
  );
  for (const row of result.rows) {
    const tag = rowToTag(row);
    if (!map.has(tag.reviewId)) map.set(tag.reviewId, []);
    map.get(tag.reviewId)!.push(tag);
  }
  return map;
}

/**
 * Get the most frequently used tags across all reviews.
 * Used for autocomplete suggestions.
 */
export async function getPopularTags(limit = 20): Promise<{ tag: string; count: number }[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    `SELECT tag, COUNT(*) AS cnt
     FROM review_tags
     GROUP BY tag
     ORDER BY cnt DESC, tag ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => ({
    tag: row.tag as string,
    count: Number(row.cnt),
  }));
}

// ---------------------------------------------------------------------------
// Check group display order
// ---------------------------------------------------------------------------

export interface CheckGroupOrderRow {
  checkGroup: string;
  displayOrder: number;
  updatedAt: string;
}

/**
 * Get the display order for all check groups, sorted by display_order ASC.
 */
export async function getCheckGroupOrder(): Promise<CheckGroupOrderRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT check_group, display_order, updated_at FROM check_group_order ORDER BY display_order ASC"
  );
  return result.rows.map((row) => ({
    checkGroup: row.check_group as string,
    displayOrder: Number(row.display_order),
    updatedAt: (row.updated_at as Date).toISOString(),
  }));
}

/**
 * Bulk update check group display order.
 * Uses a single transaction to update all rows atomically.
 */
export async function updateCheckGroupOrder(
  order: { checkGroup: string; displayOrder: number }[]
): Promise<CheckGroupOrderRow[]> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of order) {
      await client.query(
        "UPDATE check_group_order SET display_order = $1, updated_at = NOW() WHERE check_group = $2",
        [item.displayOrder, item.checkGroup]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Return the updated order
  return getCheckGroupOrder();
}

// ---------------------------------------------------------------------------
// Review assignments
// ---------------------------------------------------------------------------

export type AssignmentStatus = "pending" | "in_progress" | "completed";

export interface ReviewAssignmentRow {
  id: string;
  reviewId: string;
  assignedTo: string;
  assignedBy: string;
  assignedByName: string;
  status: AssignmentStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToAssignment(row: Record<string, unknown>): ReviewAssignmentRow {
  return {
    id: row.id as string,
    reviewId: row.review_id as string,
    assignedTo: row.assigned_to as string,
    assignedBy: row.assigned_by as string,
    assignedByName: row.assigned_by_name as string,
    status: row.status as AssignmentStatus,
    note: (row.note as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/** Create an assignment for a review. Returns the new assignment. */
export async function assignReview(
  reviewId: string,
  assignedTo: string,
  assignedBy: string,
  assignedByName: string,
  note?: string
): Promise<ReviewAssignmentRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO review_assignments (review_id, assigned_to, assigned_by, assigned_by_name, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [reviewId, assignedTo, assignedBy, assignedByName, note ?? null]
  );
  return rowToAssignment(result.rows[0]);
}

/** List all assignments for a review, newest first. */
export async function getAssignmentsForReview(reviewId: string): Promise<ReviewAssignmentRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM review_assignments WHERE review_id = $1 ORDER BY created_at DESC",
    [reviewId]
  );
  return result.rows.map(rowToAssignment);
}

/** List all assignments for a user, newest first. */
export async function getAssignmentsForUser(userId: string): Promise<ReviewAssignmentRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM review_assignments WHERE assigned_to = $1 ORDER BY created_at DESC",
    [userId]
  );
  return result.rows.map(rowToAssignment);
}

/** Update the status of an assignment. Returns the updated row or null if not found. */
export async function updateAssignmentStatus(
  assignmentId: string,
  status: AssignmentStatus
): Promise<ReviewAssignmentRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    `UPDATE review_assignments SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [assignmentId, status]
  );
  if (result.rows.length === 0) return null;
  return rowToAssignment(result.rows[0]);
}

/** Delete an assignment. Returns true if deleted. */
export async function deleteAssignment(assignmentId: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query("DELETE FROM review_assignments WHERE id = $1", [assignmentId]);
  return (result.rowCount ?? 0) > 0;
}

/** Get a single assignment by ID. */
export async function getAssignmentById(assignmentId: string): Promise<ReviewAssignmentRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query("SELECT * FROM review_assignments WHERE id = $1", [assignmentId]);
  if (result.rows.length === 0) return null;
  return rowToAssignment(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Workflow status operations
// ---------------------------------------------------------------------------

/**
 * Update the workflow status of a review and log the transition to the audit log.
 * Returns the updated review row or null if the review wasn't found / already deleted.
 */
export async function updateWorkflowStatus(
  reviewId: string,
  status: WorkflowStatus,
  userId: string,
  userEmail: string | null
): Promise<ReviewRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    `UPDATE reviews
     SET workflow_status = $2, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [reviewId, status]
  );
  if (result.rows.length === 0) return null;

  // Audit log (fire-and-forget)
  logAuditEvent(reviewId, userId, userEmail, "workflow.transition", {
    newStatus: status,
  });

  return rowToReview(result.rows[0]);
}

/**
 * Get reviews filtered by workflow status. Admin sees all; provide userId to
 * restrict to a single user's reviews.
 */
export async function getReviewsByWorkflowStatus(
  status: WorkflowStatus,
  userId?: string
): Promise<ReviewRow[]> {
  if (!pool) return [];
  await ensureSchema();

  const conditions = ["deleted_at IS NULL", "workflow_status = $1"];
  const params: unknown[] = [status];

  if (userId) {
    conditions.push(`user_id = $${params.length + 1}`);
    params.push(userId);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const result = await pool.query(
    `SELECT * FROM reviews ${where} ORDER BY updated_at DESC`,
    params
  );
  return result.rows.map(rowToReview);
}

// ---------------------------------------------------------------------------
// Finding resolutions (state machine for tracking action on findings)
// ---------------------------------------------------------------------------

export type ResolutionStatus = "open" | "addressing" | "resolved" | "dismissed";

export const RESOLUTION_STATUSES: readonly ResolutionStatus[] = [
  "open",
  "addressing",
  "resolved",
  "dismissed",
] as const;

export interface FindingResolutionRow {
  id: string;
  reviewId: string;
  findingIndex: number;
  status: ResolutionStatus;
  changedBy: string;
  changedByName: string | null;
  comment: string | null;
  createdAt: string;
}

function rowToResolution(row: Record<string, unknown>): FindingResolutionRow {
  return {
    id: row.id as string,
    reviewId: row.review_id as string,
    findingIndex: row.finding_index as number,
    status: row.status as ResolutionStatus,
    changedBy: row.changed_by as string,
    changedByName: (row.changed_by_name as string) ?? null,
    comment: (row.comment as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Review versions (link reviews as sequential versions of the same document)
// ---------------------------------------------------------------------------

export interface ReviewVersionRow {
  id: string;
  groupId: string;
  reviewId: string;
  versionNumber: number;
  createdAt: string;
}

function rowToVersion(row: Record<string, unknown>): ReviewVersionRow {
  return {
    id: row.id as string,
    groupId: row.group_id as string,
    reviewId: row.review_id as string,
    versionNumber: Number(row.version_number),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reviewer workload stats
// ---------------------------------------------------------------------------

export interface ReviewerWorkloadStats {
  /** Per-reviewer breakdown */
  reviewers: {
    userId: string;
    userName: string;
    userEmail: string;
    pending: number;
    inProgress: number;
    completed: number;
    /** Average turnaround time in milliseconds (assignment created -> completed), null if no completed assignments */
    avgTurnaroundMs: number | null;
    /** Reviews assigned in last 7 days */
    last7Days: number;
    /** Reviews assigned in last 30 days */
    last30Days: number;
  }[];
  /** Aggregate totals */
  totals: {
    totalPending: number;
    totalInProgress: number;
    totalCompleted: number;
    totalAssignments: number;
  };
}

/**
 * Get the current resolution status for every finding in a review.
 * Returns a Map keyed by finding_index, with the latest status and full history.
 */
export async function getResolutionsForReview(
  reviewId: string
): Promise<Map<number, { status: ResolutionStatus; history: FindingResolutionRow[] }>> {
  if (!pool) return new Map();
  await ensureSchema();

  const result = await pool.query(
    `SELECT * FROM finding_resolutions WHERE review_id = $1 ORDER BY finding_index ASC, created_at ASC`,
    [reviewId]
  );

  const map = new Map<number, { status: ResolutionStatus; history: FindingResolutionRow[] }>();
  for (const raw of result.rows) {
    const row = rowToResolution(raw);
    if (!map.has(row.findingIndex)) {
      map.set(row.findingIndex, { status: row.status, history: [] });
    }
    const entry = map.get(row.findingIndex)!;
    entry.status = row.status; // last row wins (ordered by created_at ASC)
    entry.history.push(row);
  }

  return map;
}

/**
 * Append a new resolution status for a finding (append-only history).
 */
export async function updateFindingResolution(
  reviewId: string,
  findingIndex: number,
  status: ResolutionStatus,
  userId: string,
  userName: string | null,
  comment?: string
): Promise<FindingResolutionRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();

  const result = await pool.query(
    `INSERT INTO finding_resolutions (review_id, finding_index, status, changed_by, changed_by_name, comment)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [reviewId, findingIndex, status, userId, userName, comment ?? null]
  );

  return rowToResolution(result.rows[0]);
}

/**
 * Get the full resolution history for a single finding.
 */
export async function getResolutionHistory(
  reviewId: string,
  findingIndex: number
): Promise<FindingResolutionRow[]> {
  if (!pool) return [];
  await ensureSchema();

  const result = await pool.query(
    `SELECT * FROM finding_resolutions WHERE review_id = $1 AND finding_index = $2 ORDER BY created_at ASC`,
    [reviewId, findingIndex]
  );

  return result.rows.map(rowToResolution);
}

// ---------------------------------------------------------------------------
// Reviewer workload query
// ---------------------------------------------------------------------------

/**
 * Aggregate reviewer workload from review_assignments and reviews tables.
 * Returns null if the pool is absent.
 */
export async function getReviewerWorkload(): Promise<ReviewerWorkloadStats | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(`
    WITH
    assignment_stats AS (
      SELECT
        ra.assigned_to,
        COUNT(*) FILTER (WHERE ra.status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE ra.status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE ra.status = 'completed') AS completed,
        AVG(
          CASE WHEN ra.status = 'completed'
            THEN EXTRACT(EPOCH FROM (ra.updated_at - ra.created_at)) * 1000
            ELSE NULL
          END
        ) AS avg_turnaround_ms,
        COUNT(*) FILTER (WHERE ra.created_at >= NOW() - INTERVAL '7 days') AS last_7_days,
        COUNT(*) FILTER (WHERE ra.created_at >= NOW() - INTERVAL '30 days') AS last_30_days
      FROM review_assignments ra
      GROUP BY ra.assigned_to
    ),
    user_info AS (
      SELECT DISTINCT ON (user_id)
        user_id,
        user_name,
        user_email
      FROM reviews
      WHERE deleted_at IS NULL
      ORDER BY user_id, created_at DESC
    ),
    reviewer_rows AS (
      SELECT
        a.assigned_to AS user_id,
        COALESCE(u.user_name, a.assigned_to) AS user_name,
        COALESCE(u.user_email, '') AS user_email,
        a.pending,
        a.in_progress,
        a.completed,
        a.avg_turnaround_ms,
        a.last_7_days,
        a.last_30_days
      FROM assignment_stats a
      LEFT JOIN user_info u ON u.user_id = a.assigned_to
      ORDER BY (a.pending + a.in_progress) DESC, a.assigned_to
    ),
    totals AS (
      SELECT
        COALESCE(SUM(pending), 0) AS total_pending,
        COALESCE(SUM(in_progress), 0) AS total_in_progress,
        COALESCE(SUM(completed), 0) AS total_completed
      FROM assignment_stats
    )

    SELECT json_build_object(
      'reviewers', COALESCE(
        (SELECT json_agg(json_build_object(
          'userId', r.user_id,
          'userName', r.user_name,
          'userEmail', r.user_email,
          'pending', r.pending,
          'inProgress', r.in_progress,
          'completed', r.completed,
          'avgTurnaroundMs', r.avg_turnaround_ms,
          'last7Days', r.last_7_days,
          'last30Days', r.last_30_days
        )) FROM reviewer_rows r),
        '[]'::json
      ),
      'totals', (SELECT json_build_object(
        'totalPending', total_pending,
        'totalInProgress', total_in_progress,
        'totalCompleted', total_completed,
        'totalAssignments', total_pending + total_in_progress + total_completed
      ) FROM totals)
    ) AS data
  `);

  const raw = result.rows[0].data;

  return {
    reviewers: (raw.reviewers as {
      userId: string;
      userName: string;
      userEmail: string;
      pending: string;
      inProgress: string;
      completed: string;
      avgTurnaroundMs: string | null;
      last7Days: string;
      last30Days: string;
    }[]).map((r) => ({
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      pending: Number(r.pending),
      inProgress: Number(r.inProgress),
      completed: Number(r.completed),
      avgTurnaroundMs: r.avgTurnaroundMs != null ? Number(r.avgTurnaroundMs) : null,
      last7Days: Number(r.last7Days),
      last30Days: Number(r.last30Days),
    })),
    totals: {
      totalPending: Number(raw.totals.totalPending),
      totalInProgress: Number(raw.totals.totalInProgress),
      totalCompleted: Number(raw.totals.totalCompleted),
      totalAssignments: Number(raw.totals.totalAssignments),
    },
  };
}

// ---------------------------------------------------------------------------
// Custom prompts (admin overrides for check group system prompts)
// ---------------------------------------------------------------------------

export interface CustomPromptRow {
  checkGroup: string;
  systemPrompt: string;
  updatedBy: string;
  updatedAt: string;
  isActive: boolean;
}

function rowToCustomPrompt(row: Record<string, unknown>): CustomPromptRow {
  return {
    checkGroup: row.check_group as string,
    systemPrompt: row.system_prompt as string,
    updatedBy: row.updated_by as string,
    updatedAt: (row.updated_at as Date).toISOString(),
    isActive: row.is_active as boolean,
  };
}

/** Get a single custom prompt by check group ID. Returns null if not found. */
export async function getCustomPrompt(checkGroup: string): Promise<CustomPromptRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM custom_prompts WHERE check_group = $1",
    [checkGroup]
  );
  if (result.rows.length === 0) return null;
  return rowToCustomPrompt(result.rows[0]);
}

/** List all custom prompt overrides, ordered by check group name. */
export async function getAllCustomPrompts(): Promise<CustomPromptRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM custom_prompts ORDER BY check_group"
  );
  return result.rows.map(rowToCustomPrompt);
}

/** Create or update a custom prompt override. Returns the upserted row. */
export async function upsertCustomPrompt(
  checkGroup: string,
  systemPrompt: string,
  userId: string
): Promise<CustomPromptRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO custom_prompts (check_group, system_prompt, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (check_group) DO UPDATE SET
       system_prompt = $2,
       updated_by = $3,
       updated_at = NOW()
     RETURNING *`,
    [checkGroup, systemPrompt, userId]
  );
  return rowToCustomPrompt(result.rows[0]);
}

/** Delete a custom prompt override (reverts to default). Returns true if deleted. */
export async function deleteCustomPrompt(checkGroup: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    "DELETE FROM custom_prompts WHERE check_group = $1",
    [checkGroup]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Toggle the active state of a custom prompt. Returns the updated row or null. */
export async function toggleCustomPromptActive(
  checkGroup: string,
  isActive: boolean
): Promise<CustomPromptRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    `UPDATE custom_prompts
     SET is_active = $2, updated_at = NOW()
     WHERE check_group = $1
     RETURNING *`,
    [checkGroup, isActive]
  );
  if (result.rows.length === 0) return null;
  return rowToCustomPrompt(result.rows[0]);
}

/**
 * Get the active custom prompt for a check group, if one exists.
 * Used by the pipeline to resolve the effective prompt.
 */
export async function getActivePromptForGroup(checkGroup: string): Promise<string | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    "SELECT system_prompt FROM custom_prompts WHERE check_group = $1 AND is_active = true",
    [checkGroup]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].system_prompt as string;
}

// ---------------------------------------------------------------------------
// Token usage tracking
// ---------------------------------------------------------------------------

export interface TokenUsageRow {
  id: string;
  reviewId: string;
  checkGroup: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
}

export interface TokenUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalCostUsd: number;
  reviewCount: number;
  avgCostPerReview: number;
  byProvider: { provider: string; inputTokens: number; outputTokens: number; reasoningTokens: number; costUsd: number; reviewCount: number }[];
  byUser: { userId: string; userName: string; userEmail: string; totalCostUsd: number; reviewCount: number }[];
  daily: { day: string; costUsd: number; reviewCount: number }[];
}

/**
 * Record token usage for a single check group invocation.
 */
export async function recordTokenUsage(entry: {
  reviewId: string;
  checkGroup: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
}): Promise<void> {
  if (!pool) return;
  await ensureSchema();
  await pool.query(
    `INSERT INTO token_usage (review_id, check_group, provider, input_tokens, output_tokens, reasoning_tokens, estimated_cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [entry.reviewId, entry.checkGroup, entry.provider, entry.inputTokens, entry.outputTokens, entry.reasoningTokens, entry.estimatedCostUsd]
  );
}

/**
 * Get token usage breakdown for a specific review.
 */
export async function getTokenUsageForReview(reviewId: string): Promise<TokenUsageRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    `SELECT id, review_id, check_group, provider, input_tokens, output_tokens, reasoning_tokens, estimated_cost_usd, created_at
     FROM token_usage WHERE review_id = $1 ORDER BY created_at ASC`,
    [reviewId]
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    reviewId: row.review_id as string,
    checkGroup: row.check_group as string,
    provider: row.provider as string,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    reasoningTokens: Number(row.reasoning_tokens),
    estimatedCostUsd: Number(row.estimated_cost_usd),
    createdAt: (row.created_at as Date).toISOString(),
  }));
}

/**
 * Get aggregated token usage summary across all reviews.
 * Optionally filtered by number of days back from now.
 */
export async function getTokenUsageSummary(days?: number): Promise<TokenUsageSummary | null> {
  if (!pool) return null;
  await ensureSchema();

  const dateFilter = days ? `AND tu.created_at >= NOW() - INTERVAL '${Number(days)} days'` : "";
  const dailyDays = days ? Math.min(days, 90) : 30;

  const result = await pool.query(`
    WITH
    filtered AS (
      SELECT tu.*, r.user_id, r.user_name, r.user_email
      FROM token_usage tu
      JOIN reviews r ON r.id = tu.review_id
      WHERE r.deleted_at IS NULL ${dateFilter}
    ),

    totals AS (
      SELECT
        COALESCE(SUM(input_tokens), 0) AS total_input,
        COALESCE(SUM(output_tokens), 0) AS total_output,
        COALESCE(SUM(reasoning_tokens), 0) AS total_reasoning,
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost,
        COUNT(DISTINCT review_id) AS review_count
      FROM filtered
    ),

    by_provider AS (
      SELECT
        provider,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(reasoning_tokens) AS reasoning_tokens,
        SUM(estimated_cost_usd) AS cost_usd,
        COUNT(DISTINCT review_id) AS review_count
      FROM filtered
      GROUP BY provider
      ORDER BY cost_usd DESC
    ),

    by_user AS (
      SELECT
        user_id,
        MAX(user_name) AS user_name,
        MAX(user_email) AS user_email,
        SUM(estimated_cost_usd) AS total_cost_usd,
        COUNT(DISTINCT review_id) AS review_count
      FROM filtered
      GROUP BY user_id
      ORDER BY total_cost_usd DESC
      LIMIT 10
    ),

    daily_series AS (
      SELECT gs::date AS day
      FROM generate_series(
        (NOW() AT TIME ZONE 'UTC')::date - ${dailyDays - 1},
        (NOW() AT TIME ZONE 'UTC')::date,
        '1 day'::interval
      ) AS gs
    ),
    daily_costs AS (
      SELECT ds.day,
        COALESCE(SUM(f.estimated_cost_usd), 0) AS cost_usd,
        COUNT(DISTINCT f.review_id) AS review_count
      FROM daily_series ds
      LEFT JOIN filtered f
        ON f.created_at >= (ds.day::timestamp AT TIME ZONE 'UTC')
        AND f.created_at < ((ds.day + 1)::timestamp AT TIME ZONE 'UTC')
      GROUP BY ds.day
      ORDER BY ds.day
    )

    SELECT json_build_object(
      'totals', (SELECT row_to_json(totals) FROM totals),
      'byProvider', COALESCE((SELECT json_agg(row_to_json(by_provider)) FROM by_provider), '[]'::json),
      'byUser', COALESCE((SELECT json_agg(row_to_json(by_user)) FROM by_user), '[]'::json),
      'daily', COALESCE((SELECT json_agg(row_to_json(daily_costs)) FROM daily_costs), '[]'::json)
    ) AS data
  `);

  const raw = result.rows[0].data;
  const totals = raw.totals;
  const reviewCount = Number(totals.review_count);

  return {
    totalInputTokens: Number(totals.total_input),
    totalOutputTokens: Number(totals.total_output),
    totalReasoningTokens: Number(totals.total_reasoning),
    totalCostUsd: Number(totals.total_cost),
    reviewCount,
    avgCostPerReview: reviewCount > 0 ? Number(totals.total_cost) / reviewCount : 0,
    byProvider: (raw.byProvider as { provider: string; input_tokens: string; output_tokens: string; reasoning_tokens: string; cost_usd: string; review_count: string }[]).map((r) => ({
      provider: r.provider,
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      reasoningTokens: Number(r.reasoning_tokens),
      costUsd: Number(r.cost_usd),
      reviewCount: Number(r.review_count),
    })),
    byUser: (raw.byUser as { user_id: string; user_name: string; user_email: string; total_cost_usd: string; review_count: string }[]).map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      totalCostUsd: Number(r.total_cost_usd),
      reviewCount: Number(r.review_count),
    })),
    daily: (raw.daily as { day: string; cost_usd: string; review_count: string }[]).map((r) => ({
      day: r.day,
      costUsd: Number(r.cost_usd),
      reviewCount: Number(r.review_count),
    })),
  };
}

/**
 * Get token usage filtered by date range.
 */
export async function getTokenUsageByDateRange(startDate: string, endDate: string): Promise<TokenUsageRow[]> {
  if (!pool) return [];
  await ensureSchema();

  const result = await pool.query(
    `SELECT tu.id, tu.review_id, tu.check_group, tu.provider, tu.input_tokens, tu.output_tokens,
            tu.reasoning_tokens, tu.estimated_cost_usd, tu.created_at
     FROM token_usage tu
     JOIN reviews r ON r.id = tu.review_id
     WHERE r.deleted_at IS NULL
       AND tu.created_at >= $1::timestamptz
       AND tu.created_at <= $2::timestamptz
     ORDER BY tu.created_at ASC`,
    [startDate, endDate]
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    reviewId: row.review_id as string,
    checkGroup: row.check_group as string,
    provider: row.provider as string,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    reasoningTokens: Number(row.reasoning_tokens),
    estimatedCostUsd: Number(row.estimated_cost_usd),
    createdAt: (row.created_at as Date).toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Review version comparison
// ---------------------------------------------------------------------------

/**
 * Link a review as a version in a version group.
 * - If groupId is provided, adds to that existing group with the next version number.
 * - If groupId is omitted, creates a new group (new UUID) starting at version 1.
 * Returns the newly created version row.
 */
export async function linkReviewVersion(
  reviewId: string,
  groupId?: string
): Promise<ReviewVersionRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();

  const gid = groupId ?? (await generateUUID());

  // Determine next version number for this group
  const maxResult = await pool.query(
    "SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM review_versions WHERE group_id = $1",
    [gid]
  );
  const nextVersion = Number(maxResult.rows[0].max_ver) + 1;

  const result = await pool.query(
    `INSERT INTO review_versions (group_id, review_id, version_number)
     VALUES ($1, $2, $3)
     ON CONFLICT (review_id) DO UPDATE SET
       group_id = $1,
       version_number = $3
     RETURNING *`,
    [gid, reviewId, nextVersion]
  );

  return rowToVersion(result.rows[0]);
}

/** Helper to generate a UUID via the database. */
async function generateUUID(): Promise<string> {
  if (!pool) throw new Error("Database pool not initialized");
  const result = await pool.query("SELECT gen_random_uuid() AS id");
  return result.rows[0].id as string;
}

/**
 * Get the version group for a given review.
 * Returns all reviews in the same version group, ordered by version number.
 * Returns null if the review is not part of any version group.
 */
export async function getVersionGroup(
  reviewId: string
): Promise<{ groupId: string; versions: ReviewVersionRow[] } | null> {
  if (!pool) return null;
  await ensureSchema();

  // Find the group_id for this review
  const groupResult = await pool.query(
    "SELECT group_id FROM review_versions WHERE review_id = $1",
    [reviewId]
  );
  if (groupResult.rows.length === 0) return null;

  const groupId = groupResult.rows[0].group_id as string;
  return getVersionGroupByGroupId(groupId);
}

/**
 * Get all versions in a version group by group ID, ordered by version number.
 */
export async function getVersionGroupByGroupId(
  groupId: string
): Promise<{ groupId: string; versions: ReviewVersionRow[] } | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(
    "SELECT * FROM review_versions WHERE group_id = $1 ORDER BY version_number ASC",
    [groupId]
  );
  if (result.rows.length === 0) return null;

  return {
    groupId,
    versions: result.rows.map(rowToVersion),
  };
}

/**
 * Unlink a review from its version group. If it was the last review in the
 * group, the group simply ceases to exist. Returns true if a row was removed.
 */
export async function unlinkReviewVersion(reviewId: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    "DELETE FROM review_versions WHERE review_id = $1",
    [reviewId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Student quality trends
// ---------------------------------------------------------------------------

export interface StudentTrendPoint {
  reviewId: string;
  fileName: string | null;
  date: string;
  qualityScore: number;
  findingCount: number;
  overallAssessment: string | null;
  categoryBreakdown: { category: string; count: number; deduction: number }[];
}

export interface StudentTrendData {
  userId: string;
  userName: string;
  userEmail: string;
  points: StudentTrendPoint[];
}

/**
 * Returns quality trend data for a specific user across all their completed
 * (non-deleted) reviews. Quality score is computed server-side using the same
 * formula as the client: 100 minus the sum of severity weights per finding.
 */
export async function getStudentQualityTrends(userId: string): Promise<StudentTrendData | null> {
  if (!pool) return null;
  await ensureSchema();

  // Get severity weights from config (same source as client-side QualityScore)
  const weightsResult = await pool.query(
    "SELECT severity, weight FROM severity_config"
  );
  const weightMap: Record<string, number> = {};
  for (const row of weightsResult.rows) {
    weightMap[row.severity as string] = Number(row.weight);
  }

  const result = await pool.query(
    `SELECT
       r.id,
       r.user_name,
       r.user_email,
       r.file_name,
       r.created_at,
       r.feedback->>'overallAssessment' AS overall_assessment,
       r.feedback->'findings' AS findings_json
     FROM reviews r
     WHERE r.user_id = $1
       AND r.status = 'done'
       AND r.deleted_at IS NULL
       AND r.feedback IS NOT NULL
       AND jsonb_typeof(r.feedback->'findings') = 'array'
     ORDER BY r.created_at ASC`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  const firstRow = result.rows[0];
  const points: StudentTrendPoint[] = [];

  for (const row of result.rows) {
    const findings = (row.findings_json as { severity?: string; category?: string }[]) ?? [];
    let totalDeduction = 0;
    const catMap: Record<string, { count: number; deduction: number }> = {};

    for (const f of findings) {
      const sev = f.severity ?? "suggestion";
      const cat = f.category ?? "other";
      const w = weightMap[sev] ?? 0;
      totalDeduction += w;
      if (!catMap[cat]) catMap[cat] = { count: 0, deduction: 0 };
      catMap[cat].count++;
      catMap[cat].deduction += w;
    }

    points.push({
      reviewId: row.id as string,
      fileName: (row.file_name as string) ?? null,
      date: (row.created_at as Date).toISOString(),
      qualityScore: Math.max(0, 100 - totalDeduction),
      findingCount: findings.length,
      overallAssessment: (row.overall_assessment as string) ?? null,
      categoryBreakdown: Object.entries(catMap)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.deduction - a.deduction),
    });
  }

  return {
    userId,
    userName: firstRow.user_name as string,
    userEmail: firstRow.user_email as string,
    points,
  };
}

export interface StudentSummary {
  userId: string;
  userName: string;
  userEmail: string;
  reviewCount: number;
  avgScore: number;
  /** "improving" | "declining" | "stable" based on linear trend of scores. */
  trend: "improving" | "declining" | "stable";
  lastReviewDate: string;
}

/**
 * Returns summary data for all students: review count, average quality score,
 * and trend direction. Used by the admin student-trends dashboard.
 */
export async function getAllStudentSummaries(): Promise<StudentSummary[]> {
  if (!pool) return [];
  await ensureSchema();

  // Get severity weights
  const weightsResult = await pool.query(
    "SELECT severity, weight FROM severity_config"
  );
  const weightMap: Record<string, number> = {};
  for (const row of weightsResult.rows) {
    weightMap[row.severity as string] = Number(row.weight);
  }

  const result = await pool.query(`
    SELECT
      r.user_id,
      MAX(r.user_name) AS user_name,
      MAX(r.user_email) AS user_email,
      r.id,
      r.created_at,
      r.feedback->'findings' AS findings_json
    FROM reviews r
    WHERE r.status = 'done'
      AND r.deleted_at IS NULL
      AND r.feedback IS NOT NULL
      AND jsonb_typeof(r.feedback->'findings') = 'array'
    GROUP BY r.user_id, r.id, r.created_at, r.feedback
    ORDER BY r.user_id, r.created_at ASC
  `);

  // Group by user and compute scores
  const userMap = new Map<string, {
    userName: string;
    userEmail: string;
    scores: number[];
    lastDate: Date;
  }>();

  for (const row of result.rows) {
    const uid = row.user_id as string;
    const findings = (row.findings_json as { severity?: string }[]) ?? [];
    let deduction = 0;
    for (const f of findings) {
      deduction += weightMap[f.severity ?? "suggestion"] ?? 0;
    }
    const score = Math.max(0, 100 - deduction);
    const createdAt = row.created_at as Date;

    if (!userMap.has(uid)) {
      userMap.set(uid, {
        userName: row.user_name as string,
        userEmail: row.user_email as string,
        scores: [],
        lastDate: createdAt,
      });
    }
    const entry = userMap.get(uid)!;
    entry.scores.push(score);
    if (createdAt > entry.lastDate) entry.lastDate = createdAt;
  }

  const summaries: StudentSummary[] = [];

  for (const [userId, entry] of userMap) {
    const avgScore = entry.scores.length > 0
      ? Math.round(entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length * 10) / 10
      : 0;

    // Compute trend: compare average of first half vs second half
    let trend: "improving" | "declining" | "stable" = "stable";
    if (entry.scores.length >= 2) {
      const mid = Math.floor(entry.scores.length / 2);
      const firstHalf = entry.scores.slice(0, mid);
      const secondHalf = entry.scores.slice(mid);
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const diff = avgSecond - avgFirst;
      if (diff >= 5) trend = "improving";
      else if (diff <= -5) trend = "declining";
    }

    summaries.push({
      userId,
      userName: entry.userName,
      userEmail: entry.userEmail,
      reviewCount: entry.scores.length,
      avgScore,
      trend,
      lastReviewDate: entry.lastDate.toISOString(),
    });
  }

  // Sort by most recent review first
  summaries.sort((a, b) =>
    new Date(b.lastReviewDate).getTime() - new Date(a.lastReviewDate).getTime()
  );

  return summaries;
}

// ---------------------------------------------------------------------------
// Finding SLA (Service Level Agreement deadlines for finding resolutions)
// ---------------------------------------------------------------------------

export interface FindingSLARow {
  id: string;
  reviewId: string;
  findingIndex: number;
  deadline: string;
  severity: string;
  setBy: string;
  setByName: string | null;
  createdAt: string;
}

function rowToSLA(row: Record<string, unknown>): FindingSLARow {
  return {
    id: row.id as string,
    reviewId: row.review_id as string,
    findingIndex: row.finding_index as number,
    deadline: (row.deadline as Date).toISOString(),
    severity: row.severity as string,
    setBy: row.set_by as string,
    setByName: (row.set_by_name as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/**
 * Set or update an SLA deadline for a specific finding.
 * Uses upsert on the (review_id, finding_index) unique constraint.
 */
export async function setFindingSLA(
  reviewId: string,
  findingIndex: number,
  deadline: string,
  severity: string,
  userId: string,
  userName: string | null
): Promise<FindingSLARow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO finding_sla (review_id, finding_index, deadline, severity, set_by, set_by_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (review_id, finding_index) DO UPDATE SET
       deadline = $3,
       severity = $4,
       set_by = $5,
       set_by_name = $6,
       created_at = NOW()
     RETURNING *`,
    [reviewId, findingIndex, deadline, severity, userId, userName]
  );
  return rowToSLA(result.rows[0]);
}

/**
 * Get all SLA entries for a given review, keyed by finding index.
 */
export async function getFindingSLAsForReview(
  reviewId: string
): Promise<FindingSLARow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM finding_sla WHERE review_id = $1 ORDER BY finding_index ASC",
    [reviewId]
  );
  return result.rows.map(rowToSLA);
}

/**
 * Get all findings that are past their SLA deadline and are NOT resolved/dismissed.
 * Cross-references finding_resolutions to exclude findings that have been resolved.
 */
export async function getOverdueSLAs(): Promise<
  (FindingSLARow & { reviewFileName: string | null; reviewUserName: string; currentResolution: string })[]
> {
  if (!pool) return [];
  await ensureSchema();

  const result = await pool.query(`
    WITH latest_resolutions AS (
      SELECT DISTINCT ON (review_id, finding_index)
        review_id,
        finding_index,
        status
      FROM finding_resolutions
      ORDER BY review_id, finding_index, created_at DESC
    )
    SELECT
      s.*,
      r.file_name AS review_file_name,
      r.user_name AS review_user_name,
      COALESCE(lr.status, 'open') AS current_resolution
    FROM finding_sla s
    JOIN reviews r ON r.id = s.review_id AND r.deleted_at IS NULL
    LEFT JOIN latest_resolutions lr ON lr.review_id = s.review_id AND lr.finding_index = s.finding_index
    WHERE s.deadline < NOW()
      AND COALESCE(lr.status, 'open') NOT IN ('resolved', 'dismissed')
    ORDER BY s.deadline ASC
  `);

  return result.rows.map((row) => ({
    ...rowToSLA(row),
    reviewFileName: (row.review_file_name as string) ?? null,
    reviewUserName: row.review_user_name as string,
    currentResolution: row.current_resolution as string,
  }));
}

export interface SLAAnalytics {
  totalSLAs: number;
  overdueCount: number;
  avgResolutionMs: number | null;
  bySeverity: { severity: string; total: number; overdue: number }[];
  complianceRate: number;
}

/**
 * Get aggregate SLA analytics: total SLAs, overdue count, avg resolution time,
 * breakdown by severity, and compliance rate.
 */
export async function getSLAAnalytics(): Promise<SLAAnalytics | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(`
    WITH latest_resolutions AS (
      SELECT DISTINCT ON (review_id, finding_index)
        review_id,
        finding_index,
        status,
        created_at AS resolved_at
      FROM finding_resolutions
      ORDER BY review_id, finding_index, created_at DESC
    ),
    sla_with_status AS (
      SELECT
        s.*,
        COALESCE(lr.status, 'open') AS current_resolution,
        lr.resolved_at
      FROM finding_sla s
      JOIN reviews r ON r.id = s.review_id AND r.deleted_at IS NULL
      LEFT JOIN latest_resolutions lr ON lr.review_id = s.review_id AND lr.finding_index = s.finding_index
    ),
    totals AS (
      SELECT
        COUNT(*)::int AS total_slas,
        COUNT(*) FILTER (
          WHERE deadline < NOW() AND current_resolution NOT IN ('resolved', 'dismissed')
        )::int AS overdue_count,
        AVG(
          CASE WHEN current_resolution IN ('resolved', 'dismissed')
            THEN EXTRACT(EPOCH FROM (resolved_at - created_at)) * 1000
            ELSE NULL
          END
        ) AS avg_resolution_ms
      FROM sla_with_status
    ),
    severity_breakdown AS (
      SELECT
        severity,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE deadline < NOW() AND current_resolution NOT IN ('resolved', 'dismissed')
        )::int AS overdue
      FROM sla_with_status
      GROUP BY severity
      ORDER BY severity
    )
    SELECT json_build_object(
      'totalSLAs', (SELECT total_slas FROM totals),
      'overdueCount', (SELECT overdue_count FROM totals),
      'avgResolutionMs', (SELECT avg_resolution_ms FROM totals),
      'bySeverity', COALESCE(
        (SELECT json_agg(json_build_object(
          'severity', severity,
          'total', total,
          'overdue', overdue
        )) FROM severity_breakdown),
        '[]'::json
      )
    ) AS data
  `);

  const raw = result.rows[0].data;
  const totalSLAs = Number(raw.totalSLAs ?? 0);
  const overdueCount = Number(raw.overdueCount ?? 0);
  const resolvedCount = totalSLAs - overdueCount;

  return {
    totalSLAs,
    overdueCount,
    avgResolutionMs: raw.avgResolutionMs != null ? Number(raw.avgResolutionMs) : null,
    bySeverity: (raw.bySeverity as { severity: string; total: number; overdue: number }[]).map((b) => ({
      severity: String(b.severity),
      total: Number(b.total),
      overdue: Number(b.overdue),
    })),
    complianceRate: totalSLAs > 0 ? Math.round((resolvedCount / totalSLAs) * 100) : 100,
  };
}

// ---------------------------------------------------------------------------
// Finding patterns (recurring issue detection across reviews)
// ---------------------------------------------------------------------------

export interface FindingPatternRow {
  id: string;
  patternText: string;
  category: string;
  occurrenceCount: number;
  exampleReviewIds: string[];
  suggestedTemplate: string | null;
  isTemplate: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToFindingPattern(row: Record<string, unknown>): FindingPatternRow {
  return {
    id: row.id as string,
    patternText: row.pattern_text as string,
    category: row.category as string,
    occurrenceCount: Number(row.occurrence_count ?? 1),
    exampleReviewIds: (row.example_review_ids as string[]) ?? [],
    suggestedTemplate: (row.suggested_template as string) ?? null,
    isTemplate: Boolean(row.is_template),
    createdBy: (row.created_by as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/**
 * Compute word-level Jaccard similarity between two strings.
 * Returns a value between 0 (no overlap) and 1 (identical word sets).
 */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Similarity threshold for grouping findings together. */
const SIMILARITY_THRESHOLD = 0.5;
/** Minimum occurrences for a cluster to be considered a "pattern". */
const MIN_PATTERN_OCCURRENCES = 3;
/** Maximum example review IDs to store per pattern. */
const MAX_EXAMPLE_REVIEWS = 5;

/**
 * Analyze all completed reviews to find recurring finding patterns.
 * Groups findings by category, then clusters similar finding titles using
 * word-level Jaccard similarity. Persists discovered patterns to the
 * finding_patterns table (upserting by representative text + category).
 */
export async function detectFindingPatterns(): Promise<FindingPatternRow[]> {
  if (!pool) return [];
  await ensureSchema();

  // Step 1: Pull all findings from completed reviews
  const result = await pool.query(`
    SELECT r.id AS review_id, f.value AS finding
    FROM reviews r, jsonb_array_elements(r.feedback->'findings') AS f(value)
    WHERE r.status = 'done'
      AND r.deleted_at IS NULL
      AND r.feedback IS NOT NULL
      AND jsonb_typeof(r.feedback->'findings') = 'array'
  `);

  if (result.rows.length === 0) return [];

  // Step 2: Group findings by category
  interface ExtractedFinding {
    title: string;
    category: string;
    reviewId: string;
  }

  const findings: ExtractedFinding[] = result.rows.map((row) => ({
    title: (row.finding as Record<string, unknown>).title as string ?? "",
    category: (row.finding as Record<string, unknown>).category as string ?? "other",
    reviewId: row.review_id as string,
  }));

  const byCategory = new Map<string, ExtractedFinding[]>();
  for (const f of findings) {
    const cat = f.category.toLowerCase();
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(f);
  }

  // Step 3: Cluster within each category using Jaccard similarity
  interface Cluster {
    representative: string;
    category: string;
    reviewIds: Set<string>;
    count: number;
  }

  const allClusters: Cluster[] = [];

  for (const [category, catFindings] of byCategory) {
    const clusters: Cluster[] = [];

    for (const f of catFindings) {
      if (!f.title) continue;

      // Find best matching cluster
      let bestCluster: Cluster | null = null;
      let bestSim = 0;
      for (const c of clusters) {
        const sim = jaccardSimilarity(f.title, c.representative);
        if (sim > bestSim) {
          bestSim = sim;
          bestCluster = c;
        }
      }

      if (bestCluster && bestSim >= SIMILARITY_THRESHOLD) {
        bestCluster.count++;
        bestCluster.reviewIds.add(f.reviewId);
      } else {
        clusters.push({
          representative: f.title,
          category,
          reviewIds: new Set([f.reviewId]),
          count: 1,
        });
      }
    }

    // Only keep clusters with MIN_PATTERN_OCCURRENCES+ hits
    for (const c of clusters) {
      if (c.count >= MIN_PATTERN_OCCURRENCES) {
        allClusters.push(c);
      }
    }
  }

  // Step 4: Upsert patterns into the database
  // First, remove old auto-detected patterns that are NOT promoted to templates
  await pool.query(
    "DELETE FROM finding_patterns WHERE is_template = false"
  );

  for (const cluster of allClusters) {
    const exampleIds = Array.from(cluster.reviewIds).slice(0, MAX_EXAMPLE_REVIEWS);
    await pool.query(
      `INSERT INTO finding_patterns (pattern_text, category, occurrence_count, example_review_ids)
       VALUES ($1, $2, $3, $4)`,
      [cluster.representative, cluster.category, cluster.count, exampleIds]
    );
  }

  // Return all patterns (both new detections and existing templates)
  return listFindingPatterns();
}

/** List all finding patterns, ordered by occurrence count descending. */
export async function listFindingPatterns(): Promise<FindingPatternRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM finding_patterns ORDER BY occurrence_count DESC, created_at DESC"
  );
  return result.rows.map(rowToFindingPattern);
}

/** Promote a detected pattern to a reusable template. */
export async function promoteFindingPatternToTemplate(
  id: string,
  templateText: string,
  userId: string
): Promise<FindingPatternRow | null> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `UPDATE finding_patterns
     SET is_template = true, suggested_template = $2, created_by = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, templateText, userId]
  );
  if (result.rows.length === 0) return null;
  return rowToFindingPattern(result.rows[0]);
}

/** Delete a finding pattern. Returns true if deleted. */
export async function deleteFindingPattern(id: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query("DELETE FROM finding_patterns WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Severity overrides (supervisor reclassification audit trail)
// ---------------------------------------------------------------------------

export const SEVERITY_VALUES = ["critical", "major", "minor", "suggestion"] as const;
export type SeverityValue = (typeof SEVERITY_VALUES)[number];

export interface SeverityOverrideRow {
  id: string;
  reviewId: string;
  findingIndex: number;
  originalSeverity: string;
  newSeverity: string;
  reason: string | null;
  changedBy: string;
  changedByName: string | null;
  createdAt: string;
}

function rowToSeverityOverride(row: Record<string, unknown>): SeverityOverrideRow {
  return {
    id: row.id as string,
    reviewId: row.review_id as string,
    findingIndex: row.finding_index as number,
    originalSeverity: row.original_severity as string,
    newSeverity: row.new_severity as string,
    reason: (row.reason as string) ?? null,
    changedBy: row.changed_by as string,
    changedByName: (row.changed_by_name as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/**
 * Insert a new severity override for a finding. Append-only: each override
 * is a new row in the audit trail.
 */
export async function overrideFindingSeverity(override: {
  reviewId: string;
  findingIndex: number;
  originalSeverity: string;
  newSeverity: string;
  reason?: string;
  changedBy: string;
  changedByName?: string | null;
}): Promise<SeverityOverrideRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();

  const result = await pool.query(
    `INSERT INTO severity_overrides
       (review_id, finding_index, original_severity, new_severity, reason, changed_by, changed_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      override.reviewId,
      override.findingIndex,
      override.originalSeverity,
      override.newSeverity,
      override.reason ?? null,
      override.changedBy,
      override.changedByName ?? null,
    ]
  );

  return rowToSeverityOverride(result.rows[0]);
}

/**
 * Get all severity overrides for a review, ordered by finding index then time.
 * Returns a Map keyed by finding_index, each value is the list of overrides
 * (newest last) so the caller can determine the current effective severity.
 */
export async function getSeverityOverridesForReview(
  reviewId: string
): Promise<Map<number, SeverityOverrideRow[]>> {
  if (!pool) return new Map();
  await ensureSchema();

  const result = await pool.query(
    `SELECT * FROM severity_overrides
     WHERE review_id = $1
     ORDER BY finding_index ASC, created_at ASC`,
    [reviewId]
  );

  const map = new Map<number, SeverityOverrideRow[]>();
  for (const raw of result.rows) {
    const row = rowToSeverityOverride(raw);
    if (!map.has(row.findingIndex)) {
      map.set(row.findingIndex, []);
    }
    map.get(row.findingIndex)!.push(row);
  }

  return map;
}

/**
 * Get the full override history for a single finding.
 */
export async function getSeverityOverrideHistory(
  reviewId: string,
  findingIndex: number
): Promise<SeverityOverrideRow[]> {
  if (!pool) return [];
  await ensureSchema();

  const result = await pool.query(
    `SELECT * FROM severity_overrides
     WHERE review_id = $1 AND finding_index = $2
     ORDER BY created_at ASC`,
    [reviewId, findingIndex]
  );

  return result.rows.map(rowToSeverityOverride);
}

/**
 * Aggregate severity override statistics for admin analytics.
 * Returns: transition counts (original -> new), top overriders, and totals.
 */
export async function getSeverityOverrideStats(): Promise<SeverityOverrideStats | null> {
  if (!pool) return null;
  await ensureSchema();

  // Transition counts: how often each original severity gets changed to each new severity
  const transitionsResult = await pool.query(`
    SELECT original_severity, new_severity, COUNT(*)::int as count
    FROM severity_overrides
    GROUP BY original_severity, new_severity
    ORDER BY count DESC
  `);

  // Top overriders: which supervisors override most
  const overridersResult = await pool.query(`
    SELECT changed_by, changed_by_name, COUNT(*)::int as count
    FROM severity_overrides
    GROUP BY changed_by, changed_by_name
    ORDER BY count DESC
    LIMIT 20
  `);

  // Direction summary: upgrades (more severe) vs downgrades (less severe)
  const severityRank: Record<string, number> = {
    suggestion: 0,
    minor: 1,
    major: 2,
    critical: 3,
  };

  const transitions: SeverityOverrideStats["transitions"] = transitionsResult.rows.map(
    (row: Record<string, unknown>) => ({
      originalSeverity: row.original_severity as string,
      newSeverity: row.new_severity as string,
      count: row.count as number,
    })
  );

  let upgrades = 0;
  let downgrades = 0;
  let total = 0;
  for (const t of transitions) {
    total += t.count;
    const origRank = severityRank[t.originalSeverity] ?? 0;
    const newRank = severityRank[t.newSeverity] ?? 0;
    if (newRank > origRank) upgrades += t.count;
    else if (newRank < origRank) downgrades += t.count;
  }

  const topOverriders: SeverityOverrideStats["topOverriders"] = overridersResult.rows.map(
    (row: Record<string, unknown>) => ({
      userId: row.changed_by as string,
      userName: (row.changed_by_name as string) ?? null,
      count: row.count as number,
    })
  );

  return {
    transitions,
    topOverriders,
    total,
    upgrades,
    downgrades,
  };
}

export interface SeverityOverrideStats {
  transitions: {
    originalSeverity: string;
    newSeverity: string;
    count: number;
  }[];
  topOverriders: {
    userId: string;
    userName: string | null;
    count: number;
  }[];
  total: number;
  /** Cases where severity was increased (e.g. minor -> major) */
  upgrades: number;
  /** Cases where severity was decreased (e.g. major -> minor) */
  downgrades: number;
}

// ---------------------------------------------------------------------------
// Proposal relationships
// ---------------------------------------------------------------------------

export type RelationshipType =
  | "similar_topic"
  | "shared_advisor"
  | "builds_upon"
  | "contradicts"
  | "related";

export interface ProposalRelationshipRow {
  id: string;
  sourceReviewId: string;
  targetReviewId: string;
  relationshipType: RelationshipType;
  notes: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  /** Joined fields from the reviews table (filled only by getRelationshipsForReview). */
  sourceFileName?: string | null;
  targetFileName?: string | null;
  sourceUserName?: string | null;
  targetUserName?: string | null;
}

function rowToRelationship(row: Record<string, unknown>): ProposalRelationshipRow {
  return {
    id: row.id as string,
    sourceReviewId: row.source_review_id as string,
    targetReviewId: row.target_review_id as string,
    relationshipType: row.relationship_type as RelationshipType,
    notes: (row.notes as string) ?? null,
    createdBy: row.created_by as string,
    createdByName: (row.created_by_name as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    sourceFileName: (row.source_file_name as string) ?? null,
    targetFileName: (row.target_file_name as string) ?? null,
    sourceUserName: (row.source_user_name as string) ?? null,
    targetUserName: (row.target_user_name as string) ?? null,
  };
}

/** Create a relationship between two reviews. Returns the created row. */
export async function createProposalRelationship(rel: {
  sourceReviewId: string;
  targetReviewId: string;
  relationshipType: RelationshipType;
  notes?: string | null;
  createdBy: string;
  createdByName?: string | null;
}): Promise<ProposalRelationshipRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO proposal_relationships (source_review_id, target_review_id, relationship_type, notes, created_by, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_review_id, target_review_id, relationship_type) DO NOTHING
     RETURNING *`,
    [rel.sourceReviewId, rel.targetReviewId, rel.relationshipType, rel.notes ?? null, rel.createdBy, rel.createdByName ?? null]
  );
  if (result.rows.length === 0) return null;
  return rowToRelationship(result.rows[0]);
}

/**
 * Get all relationships involving a specific review (as source or target).
 * Joins with reviews table to include file names and user names.
 */
export async function getRelationshipsForReview(reviewId: string): Promise<ProposalRelationshipRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    `SELECT
       pr.*,
       src.file_name AS source_file_name,
       src.user_name AS source_user_name,
       tgt.file_name AS target_file_name,
       tgt.user_name AS target_user_name
     FROM proposal_relationships pr
     LEFT JOIN reviews src ON src.id = pr.source_review_id
     LEFT JOIN reviews tgt ON tgt.id = pr.target_review_id
     WHERE pr.source_review_id = $1 OR pr.target_review_id = $1
     ORDER BY pr.created_at DESC`,
    [reviewId]
  );
  return result.rows.map(rowToRelationship);
}

/** Delete a relationship by ID. Returns true if deleted. */
export async function deleteProposalRelationship(id: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    "DELETE FROM proposal_relationships WHERE id = $1",
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Get a single relationship by ID. */
export async function getProposalRelationshipById(id: string): Promise<ProposalRelationshipRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM proposal_relationships WHERE id = $1",
    [id]
  );
  if (result.rows.length === 0) return null;
  return rowToRelationship(result.rows[0]);
}

/**
 * Get all relationships as an edge list for visualization / admin overview.
 * Joins with reviews to include file names and user names.
 */
export async function getRelationshipGraph(): Promise<ProposalRelationshipRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    `SELECT
       pr.*,
       src.file_name AS source_file_name,
       src.user_name AS source_user_name,
       tgt.file_name AS target_file_name,
       tgt.user_name AS target_user_name
     FROM proposal_relationships pr
     LEFT JOIN reviews src ON src.id = pr.source_review_id
     LEFT JOIN reviews tgt ON tgt.id = pr.target_review_id
     ORDER BY pr.created_at DESC`
  );
  return result.rows.map(rowToRelationship);
}

/**
 * Get relationship statistics: count per type and most-connected reviews.
 */
export async function getRelationshipStats(): Promise<{
  countByType: { type: string; count: number }[];
  mostConnected: { reviewId: string; fileName: string | null; userName: string | null; count: number }[];
}> {
  if (!pool) return { countByType: [], mostConnected: [] };
  await ensureSchema();

  const typeResult = await pool.query(
    `SELECT relationship_type AS type, COUNT(*)::int AS count
     FROM proposal_relationships
     GROUP BY relationship_type
     ORDER BY count DESC`
  );

  const connectedResult = await pool.query(
    `SELECT rid AS review_id, r.file_name, r.user_name, cnt AS count FROM (
       SELECT rid, COUNT(*)::int AS cnt FROM (
         SELECT source_review_id AS rid FROM proposal_relationships
         UNION ALL
         SELECT target_review_id AS rid FROM proposal_relationships
       ) sub
       GROUP BY rid
       ORDER BY cnt DESC
       LIMIT 10
     ) top
     LEFT JOIN reviews r ON r.id = top.rid
     ORDER BY cnt DESC`
  );

  return {
    countByType: typeResult.rows.map((r) => ({ type: r.type as string, count: Number(r.count) })),
    mostConnected: connectedResult.rows.map((r) => ({
      reviewId: r.review_id as string,
      fileName: (r.file_name as string) ?? null,
      userName: (r.user_name as string) ?? null,
      count: Number(r.count),
    })),
  };
}

// ---------------------------------------------------------------------------
// Readiness checklists
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  label: string;
  checked: boolean;
}

export interface ReadinessChecklistRow {
  id: string;
  userId: string;
  fileName: string | null;
  checks: ChecklistItem[];
  passedCount: number;
  totalCount: number;
  completed: boolean;
  reviewId: string | null;
  createdAt: string;
}

function rowToReadinessChecklist(row: Record<string, unknown>): ReadinessChecklistRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    fileName: (row.file_name as string) ?? null,
    checks: (row.checks as ChecklistItem[]) ?? [],
    passedCount: Number(row.passed_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    completed: Boolean(row.completed),
    reviewId: (row.review_id as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/** Create a new readiness checklist. Returns the created row. */
export async function createReadinessChecklist(checklist: {
  userId: string;
  fileName?: string | null;
  checks: ChecklistItem[];
  reviewId?: string | null;
}): Promise<ReadinessChecklistRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const passedCount = checklist.checks.filter((c) => c.checked).length;
  const totalCount = checklist.checks.length;
  const completed = totalCount > 0 && passedCount === totalCount;
  const result = await pool.query(
    `INSERT INTO readiness_checklists (user_id, file_name, checks, passed_count, total_count, completed, review_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      checklist.userId,
      checklist.fileName ?? null,
      JSON.stringify(checklist.checks),
      passedCount,
      totalCount,
      completed,
      checklist.reviewId ?? null,
    ]
  );
  return rowToReadinessChecklist(result.rows[0]);
}

/** Update an existing readiness checklist. Returns the updated row or null if not found. */
export async function updateReadinessChecklist(
  id: string,
  userId: string,
  updates: {
    fileName?: string | null;
    checks: ChecklistItem[];
    reviewId?: string | null;
  }
): Promise<ReadinessChecklistRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const passedCount = updates.checks.filter((c) => c.checked).length;
  const totalCount = updates.checks.length;
  const completed = totalCount > 0 && passedCount === totalCount;
  const result = await pool.query(
    `UPDATE readiness_checklists
     SET file_name = COALESCE($3, file_name),
         checks = $4,
         passed_count = $5,
         total_count = $6,
         completed = $7,
         review_id = COALESCE($8, review_id)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id,
      userId,
      updates.fileName ?? null,
      JSON.stringify(updates.checks),
      passedCount,
      totalCount,
      completed,
      updates.reviewId ?? null,
    ]
  );
  if (result.rows.length === 0) return null;
  return rowToReadinessChecklist(result.rows[0]);
}

/** Get a checklist associated with a specific review. */
export async function getChecklistForReview(reviewId: string): Promise<ReadinessChecklistRow | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM readiness_checklists WHERE review_id = $1 LIMIT 1`,
    [reviewId]
  );
  if (result.rows.length === 0) return null;
  return rowToReadinessChecklist(result.rows[0]);
}

/** Get all checklists for a user, most recent first. */
export async function getChecklistsByUser(
  userId: string,
  limit = 20
): Promise<ReadinessChecklistRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM readiness_checklists
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map(rowToReadinessChecklist);
}

// ---------------------------------------------------------------------------
// Finding approvals (advisor approval workflow)
// ---------------------------------------------------------------------------

export type FindingApprovalStatus = "approved" | "disputed" | "needs_action";

export const FINDING_APPROVAL_STATUSES: readonly FindingApprovalStatus[] = [
  "approved",
  "disputed",
  "needs_action",
] as const;

export interface FindingApprovalRow {
  id: string;
  reviewId: string;
  findingIndex: number;
  status: FindingApprovalStatus;
  advisorComment: string | null;
  approvedBy: string;
  approvedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToApproval(row: Record<string, unknown>): FindingApprovalRow {
  return {
    id: row.id as string,
    reviewId: row.review_id as string,
    findingIndex: row.finding_index as number,
    status: row.status as FindingApprovalStatus,
    advisorComment: (row.advisor_comment as string) ?? null,
    approvedBy: row.approved_by as string,
    approvedByName: (row.approved_by_name as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/**
 * Upsert an approval decision for a specific finding in a review.
 * Uses ON CONFLICT on (review_id, finding_index) for idempotent writes.
 */
export async function setFindingApproval(
  reviewId: string,
  findingIndex: number,
  status: FindingApprovalStatus,
  approvedBy: string,
  approvedByName: string | null,
  advisorComment?: string
): Promise<FindingApprovalRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();

  const result = await pool.query(
    `INSERT INTO finding_approvals (review_id, finding_index, status, advisor_comment, approved_by, approved_by_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (review_id, finding_index) DO UPDATE SET
       status = EXCLUDED.status,
       advisor_comment = EXCLUDED.advisor_comment,
       approved_by = EXCLUDED.approved_by,
       approved_by_name = EXCLUDED.approved_by_name,
       updated_at = NOW()
     RETURNING *`,
    [reviewId, findingIndex, status, advisorComment ?? null, approvedBy, approvedByName]
  );

  return rowToApproval(result.rows[0]);
}

/**
 * Get all approvals for a given review, keyed by finding index.
 */
export async function getApprovalsForReview(
  reviewId: string
): Promise<Record<string, FindingApprovalRow>> {
  if (!pool) return {};
  await ensureSchema();

  const result = await pool.query(
    `SELECT * FROM finding_approvals WHERE review_id = $1 ORDER BY finding_index ASC`,
    [reviewId]
  );

  const map: Record<string, FindingApprovalRow> = {};
  for (const raw of result.rows) {
    const row = rowToApproval(raw);
    map[String(row.findingIndex)] = row;
  }
  return map;
}

/**
 * Aggregate approval statistics across all reviews.
 * Returns total counts per status and breakdown by check group category.
 */
export interface ApprovalStats {
  totals: {
    total: number;
    approved: number;
    disputed: number;
    needsAction: number;
  };
  /** Approval status counts broken down by finding category (from review feedback). */
  byCategory: {
    category: string;
    approved: number;
    disputed: number;
    needsAction: number;
    total: number;
  }[];
  /** Approval rate broken down by check group. */
  byCheckGroup: {
    checkGroup: string;
    approved: number;
    disputed: number;
    needsAction: number;
    total: number;
  }[];
}

export async function getApprovalStats(): Promise<ApprovalStats | null> {
  if (!pool) return null;
  await ensureSchema();

  // Aggregate totals
  const totalsResult = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE status = 'disputed')::int AS disputed,
      COUNT(*) FILTER (WHERE status = 'needs_action')::int AS needs_action
    FROM finding_approvals
  `);

  const totalsRow = totalsResult.rows[0];

  // To get per-category and per-check-group stats, we need to join with review feedback.
  // Since findings are stored as JSONB in the reviews table, we extract them with jsonb_array_elements.
  const categoryResult = await pool.query(`
    SELECT
      COALESCE(f->>'category', 'other') AS category,
      COUNT(*) FILTER (WHERE fa.status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE fa.status = 'disputed')::int AS disputed,
      COUNT(*) FILTER (WHERE fa.status = 'needs_action')::int AS needs_action,
      COUNT(*)::int AS total
    FROM finding_approvals fa
    JOIN reviews r ON r.id = fa.review_id
    CROSS JOIN LATERAL jsonb_array_elements(r.feedback->'findings') WITH ORDINALITY AS elems(f, idx)
    WHERE (elems.idx - 1) = fa.finding_index
    GROUP BY COALESCE(f->>'category', 'other')
    ORDER BY total DESC
  `);

  // For check group breakdown, we use the check group from the finding's source info.
  // Since findings don't directly store check_group, we approximate using the category.
  // A more accurate approach: if findings had a checkGroup field, we'd use it.
  // For now, we report the same category-based breakdown.
  const checkGroupResult = await pool.query(`
    SELECT
      COALESCE(f->>'category', 'other') AS check_group,
      COUNT(*) FILTER (WHERE fa.status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE fa.status = 'disputed')::int AS disputed,
      COUNT(*) FILTER (WHERE fa.status = 'needs_action')::int AS needs_action,
      COUNT(*)::int AS total
    FROM finding_approvals fa
    JOIN reviews r ON r.id = fa.review_id
    CROSS JOIN LATERAL jsonb_array_elements(r.feedback->'findings') WITH ORDINALITY AS elems(f, idx)
    WHERE (elems.idx - 1) = fa.finding_index
    GROUP BY COALESCE(f->>'category', 'other')
    ORDER BY total DESC
  `);

  return {
    totals: {
      total: Number(totalsRow.total),
      approved: Number(totalsRow.approved),
      disputed: Number(totalsRow.disputed),
      needsAction: Number(totalsRow.needs_action),
    },
    byCategory: categoryResult.rows.map((r) => ({
      category: r.category as string,
      approved: Number(r.approved),
      disputed: Number(r.disputed),
      needsAction: Number(r.needs_action),
      total: Number(r.total),
    })),
    byCheckGroup: checkGroupResult.rows.map((r) => ({
      checkGroup: r.check_group as string,
      approved: Number(r.approved),
      disputed: Number(r.disputed),
      needsAction: Number(r.needs_action),
      total: Number(r.total),
    })),
  };
}

// ---------------------------------------------------------------------------
// Submission Deadlines (calendar & risk analysis)
// ---------------------------------------------------------------------------

export interface DeadlineRow {
  id: string;
  title: string;
  deadline: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
}

function rowToDeadline(row: Record<string, unknown>): DeadlineRow {
  return {
    id: row.id as string,
    title: row.title as string,
    deadline: (row.deadline as Date).toISOString(),
    description: (row.description as string) ?? null,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Revision summaries (change summaries between two review versions)
// ---------------------------------------------------------------------------

/** A matched finding pair used in revision summaries. */
export interface RevisionFindingMatch {
  oldTitle: string;
  newTitle: string;
  category: string;
  similarity: number;
}

/** Summary data stored as JSONB in the revision_summaries table. */
export interface RevisionSummaryData {
  fixedFindings: { title: string; category: string; severity: string }[];
  newFindings: { title: string; category: string; severity: string }[];
  persistentFindings: { oldTitle: string; newTitle: string; category: string; similarity: number }[];
  improvementPct: number;
}

/** A row from the revision_summaries table. */
export interface RevisionSummaryRow {
  id: string;
  oldReviewId: string;
  newReviewId: string;
  fixedCount: number;
  newCount: number;
  persistentCount: number;
  summary: RevisionSummaryData;
  createdAt: string;
}

function rowToRevisionSummary(row: Record<string, unknown>): RevisionSummaryRow {
  return {
    id: row.id as string,
    oldReviewId: row.old_review_id as string,
    newReviewId: row.new_review_id as string,
    fixedCount: Number(row.fixed_count ?? 0),
    newCount: Number(row.new_count ?? 0),
    persistentCount: Number(row.persistent_count ?? 0),
    summary: (row.summary as RevisionSummaryData) ?? {
      fixedFindings: [],
      newFindings: [],
      persistentFindings: [],
      improvementPct: 0,
    },
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/** Create a new submission deadline. */
export async function createDeadline(deadline: {
  title: string;
  deadline: string;
  description?: string;
  createdBy: string;
}): Promise<DeadlineRow> {
  if (!pool) throw new Error("Database pool not initialized");
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO submission_deadlines (title, deadline, description, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [deadline.title, deadline.deadline, deadline.description ?? null, deadline.createdBy]
  );
  return rowToDeadline(result.rows[0]);
}

/** List all deadlines ordered by date. */
export async function listDeadlines(): Promise<DeadlineRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const result = await pool.query(
    "SELECT * FROM submission_deadlines ORDER BY deadline ASC"
  );
  return result.rows.map(rowToDeadline);
}

/** Delete a deadline by ID. Returns true if deleted. */
export async function deleteDeadline(id: string): Promise<boolean> {
  if (!pool) return false;
  await ensureSchema();
  const result = await pool.query(
    "DELETE FROM submission_deadlines WHERE id = $1",
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Per-day review submission counts for calendar display. */
export interface DaySubmission {
  date: string;
  count: number;
  avgFindings: number;
  avgScore: number;
}

/** Risk breakdown for a single deadline. */
export interface DeadlineRisk {
  deadlineId: string;
  title: string;
  deadline: string;
  totalSubmissions: number;
  onTimeCount: number;
  onTimePercent: number;
  last48hCount: number;
  avgFindings: number;
  avgFindingsEarly: number;
  avgFindingsLate: number;
}

/** Full analytics payload for the calendar + risk views. */
export interface DeadlineAnalytics {
  deadlines: DeadlineRow[];
  dailySubmissions: DaySubmission[];
  riskBreakdown: DeadlineRisk[];
  overallEarlyAvgFindings: number;
  overallLateAvgFindings: number;
  last48hWarningCount: number;
}

/**
 * Compute deadline analytics: daily submission counts, per-deadline risk, and
 * early-vs-late quality comparison.
 *
 * "Late" = submitted within 48 hours before the deadline.
 * "Early" = submitted more than 48 hours before the deadline.
 */
export async function getDeadlineAnalytics(): Promise<DeadlineAnalytics | null> {
  if (!pool) return null;
  await ensureSchema();

  // 1) Deadlines
  const dlResult = await pool.query(
    "SELECT * FROM submission_deadlines ORDER BY deadline ASC"
  );
  const deadlines = dlResult.rows.map(rowToDeadline);

  // 2) Daily submission counts with avg findings and quality score
  //    Quality score: good=3, acceptable=2, needs-work=1 (from feedback->overallAssessment)
  const dailyResult = await pool.query(`
    SELECT
      DATE(created_at) AS date,
      COUNT(*)::int AS count,
      COALESCE(AVG(jsonb_array_length(feedback->'findings')), 0)::float AS avg_findings,
      COALESCE(AVG(
        CASE feedback->>'overallAssessment'
          WHEN 'good' THEN 3
          WHEN 'acceptable' THEN 2
          WHEN 'needs-work' THEN 1
          ELSE 2
        END
      ), 2)::float AS avg_score
    FROM reviews
    WHERE status = 'done'
      AND deleted_at IS NULL
      AND feedback IS NOT NULL
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  const dailySubmissions: DaySubmission[] = dailyResult.rows.map((r) => ({
    date: (r.date as Date).toISOString().split("T")[0],
    count: Number(r.count),
    avgFindings: Number(Number(r.avg_findings).toFixed(1)),
    avgScore: Number(Number(r.avg_score).toFixed(2)),
  }));

  // 3) Per-deadline risk breakdown
  const riskBreakdown: DeadlineRisk[] = [];
  let totalLate48h = 0;
  let earlyFindingsSum = 0;
  let earlyCount = 0;
  let lateFindingsSum = 0;
  let lateCount = 0;

  for (const dl of deadlines) {
    // All reviews submitted before this deadline (consider reviews within a reasonable window: 60 days before)
    const riskResult = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at <= $1::timestamptz) ::int AS on_time,
        COUNT(*) FILTER (WHERE created_at > ($1::timestamptz - INTERVAL '48 hours') AND created_at <= $1::timestamptz) ::int AS last_48h,
        COALESCE(AVG(jsonb_array_length(feedback->'findings')), 0)::float AS avg_findings,
        COALESCE(AVG(jsonb_array_length(feedback->'findings')) FILTER (
          WHERE created_at <= ($1::timestamptz - INTERVAL '48 hours')
        ), 0)::float AS avg_findings_early,
        COALESCE(AVG(jsonb_array_length(feedback->'findings')) FILTER (
          WHERE created_at > ($1::timestamptz - INTERVAL '48 hours') AND created_at <= $1::timestamptz
        ), 0)::float AS avg_findings_late
      FROM reviews
      WHERE status = 'done'
        AND deleted_at IS NULL
        AND feedback IS NOT NULL
        AND created_at >= ($1::timestamptz - INTERVAL '60 days')
        AND created_at <= $1::timestamptz
    `, [dl.deadline]);

    const r = riskResult.rows[0];
    const total = Number(r.total);
    const onTime = Number(r.on_time);
    const last48h = Number(r.last_48h);
    const avgFindingsEarly = Number(Number(r.avg_findings_early).toFixed(1));
    const avgFindingsLate = Number(Number(r.avg_findings_late).toFixed(1));

    totalLate48h += last48h;

    // Aggregate for overall early/late comparison
    const earlyForDl = onTime - last48h;
    if (earlyForDl > 0) {
      earlyFindingsSum += avgFindingsEarly * earlyForDl;
      earlyCount += earlyForDl;
    }
    if (last48h > 0) {
      lateFindingsSum += avgFindingsLate * last48h;
      lateCount += last48h;
    }

    riskBreakdown.push({
      deadlineId: dl.id,
      title: dl.title,
      deadline: dl.deadline,
      totalSubmissions: total,
      onTimeCount: onTime,
      onTimePercent: total > 0 ? Number(((onTime / total) * 100).toFixed(1)) : 100,
      last48hCount: last48h,
      avgFindings: Number(Number(r.avg_findings).toFixed(1)),
      avgFindingsEarly,
      avgFindingsLate,
    });
  }

  return {
    deadlines,
    dailySubmissions,
    riskBreakdown,
    overallEarlyAvgFindings: earlyCount > 0 ? Number((earlyFindingsSum / earlyCount).toFixed(1)) : 0,
    overallLateAvgFindings: lateCount > 0 ? Number((lateFindingsSum / lateCount).toFixed(1)) : 0,
    last48hWarningCount: totalLate48h,
  };
}

// ---------------------------------------------------------------------------
// Peer Pairings (complementary strength matching)
// ---------------------------------------------------------------------------

export interface StrengthProfile {
  userId: string;
  userName: string;
  userEmail: string;
  reviewCount: number;
  /** Average finding count per category (lower = stronger). */
  categoryScores: Record<FindingCategory, number>;
}

export interface PeerPairingRow {
  id: string;
  studentAId: string;
  studentBId: string;
  studentAName: string | null;
  studentBName: string | null;
  rationale: string;
  strengthArea: string;
  weaknessArea: string;
  score: number;
  status: "suggested" | "accepted" | "rejected";
  createdAt: string;
}

function rowToPairing(row: Record<string, unknown>): PeerPairingRow {
  return {
    id: row.id as string,
    studentAId: row.student_a_id as string,
    studentBId: row.student_b_id as string,
    studentAName: (row.student_a_name as string) ?? null,
    studentBName: (row.student_b_name as string) ?? null,
    rationale: row.rationale as string,
    strengthArea: row.strength_area as string,
    weaknessArea: row.weakness_area as string,
    score: Number(row.score),
    status: row.status as "suggested" | "accepted" | "rejected",
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/**
 * Compute the strength profile for a single student.
 * Returns average finding count per finding category across all their completed reviews.
 * Lower count = stronger in that area.
 */
export async function getStudentStrengthProfile(userId: string): Promise<StrengthProfile | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(
    `SELECT
       r.user_id,
       r.user_name,
       r.user_email,
       r.feedback->'findings' AS findings_json
     FROM reviews r
     WHERE r.user_id = $1
       AND r.status = 'done'
       AND r.deleted_at IS NULL
       AND r.feedback IS NOT NULL
       AND jsonb_typeof(r.feedback->'findings') = 'array'
     ORDER BY r.created_at DESC`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  const firstRow = result.rows[0];
  const categoryTotals: Record<string, number> = {};
  for (const cat of FINDING_CATEGORY_VALUES) {
    categoryTotals[cat] = 0;
  }

  for (const row of result.rows) {
    const findings = (row.findings_json as { category?: string }[]) ?? [];
    for (const f of findings) {
      const cat = normalizeFindingCat(f.category);
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + 1;
    }
  }

  const reviewCount = result.rows.length;
  const categoryScores = {} as Record<FindingCategory, number>;
  for (const cat of FINDING_CATEGORY_VALUES) {
    categoryScores[cat] = Math.round(((categoryTotals[cat] ?? 0) / reviewCount) * 100) / 100;
  }

  return {
    userId,
    userName: firstRow.user_name as string,
    userEmail: firstRow.user_email as string,
    reviewCount,
    categoryScores,
  };
}

/** Simple category normalization (mirrors normalizeFindingCategory from types but avoids circular import). */
function normalizeFindingCat(raw: string | undefined): FindingCategory {
  if (!raw) return "other";
  const lower = raw.toLowerCase().trim();
  if (FINDING_CATEGORY_VALUES.includes(lower as FindingCategory)) return lower as FindingCategory;
  if (/format|terminol|title\s*case|heading/i.test(lower)) return "formatting";
  if (/structur|section|length|missing/i.test(lower)) return "structure";
  if (/citat|bibliograph|reference|footnote/i.test(lower)) return "citation";
  if (/method|approach|design/i.test(lower)) return "methodology";
  if (/writ|style|voice|grammar|paragraph|contraction|filler|sentence/i.test(lower)) return "writing";
  if (/figur|diagram|image|caption|uml/i.test(lower)) return "figures";
  if (/logic|argument|reasoning|coherence/i.test(lower)) return "logic";
  if (/complet|missing|absent|lack|schedul|transparen/i.test(lower)) return "completeness";
  return "other";
}

/**
 * Compute strength profiles for all students with completed reviews,
 * then generate complementary pairings. Clears existing 'suggested' pairings
 * before inserting new ones (accepted/rejected are preserved).
 */
export async function generatePeerPairings(): Promise<PeerPairingRow[]> {
  if (!pool) return [];
  await ensureSchema();

  // 1. Build strength profiles for all students
  const studentsResult = await pool.query(
    `SELECT DISTINCT r.user_id, r.user_name, r.user_email
     FROM reviews r
     WHERE r.status = 'done'
       AND r.deleted_at IS NULL
       AND r.feedback IS NOT NULL
       AND jsonb_typeof(r.feedback->'findings') = 'array'
     ORDER BY r.user_name`
  );

  if (studentsResult.rows.length < 2) return [];

  const profiles: StrengthProfile[] = [];
  for (const row of studentsResult.rows) {
    const profile = await getStudentStrengthProfile(row.user_id as string);
    if (profile && profile.reviewCount > 0) {
      profiles.push(profile);
    }
  }

  if (profiles.length < 2) return [];

  // 2. Generate pairings: for each pair, find best complementary match
  interface CandidatePairing {
    a: StrengthProfile;
    b: StrengthProfile;
    score: number;
    strengthArea: string; // A's strength (low findings) that matches B's weakness (high findings)
    weaknessArea: string; // B's strength that matches A's weakness
    rationale: string;
  }

  const candidates: CandidatePairing[] = [];
  const categories = FINDING_CATEGORY_VALUES.filter((c) => c !== "other");

  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i];
      const b = profiles[j];

      // Compute complementary score: sum of absolute differences across categories
      // Higher difference = more complementary
      let totalComplementarity = 0;
      let bestAStrength = { area: categories[0], diff: 0 };
      let bestBStrength = { area: categories[0], diff: 0 };

      for (const cat of categories) {
        const diff = a.categoryScores[cat] - b.categoryScores[cat];
        totalComplementarity += Math.abs(diff);

        // A is stronger (fewer findings) in this area, B is weaker
        if (diff < bestAStrength.diff) {
          bestAStrength = { area: cat, diff };
        }
        // B is stronger, A is weaker
        if (diff > bestBStrength.diff) {
          bestBStrength = { area: cat, diff };
        }
      }

      if (totalComplementarity > 0) {
        const strengthArea = bestAStrength.area;
        const weaknessArea = bestBStrength.area;
        const rationale =
          `${a.userName} is strong in ${strengthArea} (avg ${a.categoryScores[strengthArea as FindingCategory]} findings) ` +
          `while ${b.userName} needs improvement (avg ${b.categoryScores[strengthArea as FindingCategory]}). ` +
          `Conversely, ${b.userName} is strong in ${weaknessArea} (avg ${b.categoryScores[weaknessArea as FindingCategory]}) ` +
          `which can help ${a.userName} (avg ${a.categoryScores[weaknessArea as FindingCategory]}).`;

        candidates.push({
          a, b,
          score: Math.round(totalComplementarity * 100) / 100,
          strengthArea,
          weaknessArea,
          rationale,
        });
      }
    }
  }

  // Sort by score descending (most complementary first)
  candidates.sort((x, y) => y.score - x.score);

  // 3. Clear old suggested pairings and insert new ones
  await pool.query("DELETE FROM peer_pairings WHERE status = 'suggested'");

  const inserted: PeerPairingRow[] = [];
  for (const c of candidates) {
    try {
      const res = await pool.query(
        `INSERT INTO peer_pairings (student_a_id, student_b_id, rationale, strength_area, weakness_area, score, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'suggested')
         ON CONFLICT (student_a_id, student_b_id) DO UPDATE SET
           rationale = EXCLUDED.rationale,
           strength_area = EXCLUDED.strength_area,
           weakness_area = EXCLUDED.weakness_area,
           score = EXCLUDED.score,
           status = 'suggested',
           created_at = NOW()
         RETURNING *`,
        [c.a.userId, c.b.userId, c.rationale, c.strengthArea, c.weaknessArea, c.score]
      );
      if (res.rows.length > 0) {
        // Attach names for the returned row
        const row = res.rows[0];
        row.student_a_name = c.a.userName;
        row.student_b_name = c.b.userName;
        inserted.push(rowToPairing(row));
      }
    } catch (err) {
      console.error("[db] Failed to insert peer pairing:", err);
    }
  }

  return inserted;
}

/**
 * List all peer pairings, ordered by score descending.
 * Optionally filter by status.
 */
export async function listPeerPairings(statusFilter?: string): Promise<PeerPairingRow[]> {
  if (!pool) return [];
  await ensureSchema();

  let query = `
    SELECT
      pp.*,
      ra.user_name AS student_a_name,
      rb.user_name AS student_b_name
    FROM peer_pairings pp
    LEFT JOIN (SELECT DISTINCT ON (user_id) user_id, user_name FROM reviews ORDER BY user_id, created_at DESC) ra
      ON ra.user_id = pp.student_a_id
    LEFT JOIN (SELECT DISTINCT ON (user_id) user_id, user_name FROM reviews ORDER BY user_id, created_at DESC) rb
      ON rb.user_id = pp.student_b_id
  `;
  const params: unknown[] = [];

  if (statusFilter && ["suggested", "accepted", "rejected"].includes(statusFilter)) {
    query += " WHERE pp.status = $1";
    params.push(statusFilter);
  }

  query += " ORDER BY pp.score DESC, pp.created_at DESC";

  const result = await pool.query(query, params);
  return result.rows.map(rowToPairing);
}

/**
 * Accept or reject a peer pairing.
 */
export async function updatePairingStatus(
  pairingId: string,
  status: "accepted" | "rejected"
): Promise<PeerPairingRow | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(
    `UPDATE peer_pairings SET status = $2
     WHERE id = $1
     RETURNING *`,
    [pairingId, status]
  );

  if (result.rows.length === 0) return null;

  // Re-query to get names
  const fullResult = await pool.query(
    `SELECT
       pp.*,
       ra.user_name AS student_a_name,
       rb.user_name AS student_b_name
     FROM peer_pairings pp
     LEFT JOIN (SELECT DISTINCT ON (user_id) user_id, user_name FROM reviews ORDER BY user_id, created_at DESC) ra
       ON ra.user_id = pp.student_a_id
     LEFT JOIN (SELECT DISTINCT ON (user_id) user_id, user_name FROM reviews ORDER BY user_id, created_at DESC) rb
       ON rb.user_id = pp.student_b_id
     WHERE pp.id = $1`,
    [pairingId]
  );

  if (fullResult.rows.length === 0) return null;
  return rowToPairing(fullResult.rows[0]);
}

/**
 * Compare two reviews' findings using word-level Jaccard similarity and persist
 * the result as a revision summary. If a summary already exists for this pair
 * it is replaced (upsert).
 *
 * Both reviews must be completed (status = 'done') with feedback.
 */
export async function generateRevisionSummary(
  oldReviewId: string,
  newReviewId: string
): Promise<RevisionSummaryRow | null> {
  if (!pool) return null;
  await ensureSchema();

  // Load both reviews
  const oldReview = await getReviewById(oldReviewId);
  const newReview = await getReviewById(newReviewId);

  if (!oldReview || !newReview) return null;
  if (oldReview.status !== "done" || newReview.status !== "done") return null;

  const oldFeedback = oldReview.feedback as MergedFeedback | null;
  const newFeedback = newReview.feedback as MergedFeedback | null;

  if (!oldFeedback?.findings || !newFeedback?.findings) return null;

  const oldFindings: Finding[] = oldFeedback.findings;
  const newFindings: Finding[] = newFeedback.findings;

  // --- Match findings using Jaccard similarity ---
  const matchedOldIndices = new Set<number>();
  const matchedNewIndices = new Set<number>();
  const persistentPairs: { oldIdx: number; newIdx: number; similarity: number }[] = [];

  // For each new finding, find the best-matching old finding
  for (let ni = 0; ni < newFindings.length; ni++) {
    let bestScore = 0;
    let bestOldIdx = -1;

    for (let oi = 0; oi < oldFindings.length; oi++) {
      if (matchedOldIndices.has(oi)) continue;

      // Category must match
      if (oldFindings[oi].category.toLowerCase() !== newFindings[ni].category.toLowerCase()) continue;

      const score = jaccardSimilarity(oldFindings[oi].title, newFindings[ni].title);
      if (score > bestScore) {
        bestScore = score;
        bestOldIdx = oi;
      }
    }

    if (bestScore >= SIMILARITY_THRESHOLD && bestOldIdx >= 0) {
      matchedOldIndices.add(bestOldIdx);
      matchedNewIndices.add(ni);
      persistentPairs.push({ oldIdx: bestOldIdx, newIdx: ni, similarity: bestScore });
    }
  }

  // Fixed = old findings that didn't match any new finding
  const fixedFindings = oldFindings
    .filter((_, i) => !matchedOldIndices.has(i))
    .map((f) => ({ title: f.title, category: f.category, severity: f.severity }));

  // New = new findings that didn't match any old finding
  const newFindingsUnmatched = newFindings
    .filter((_, i) => !matchedNewIndices.has(i))
    .map((f) => ({ title: f.title, category: f.category, severity: f.severity }));

  // Persistent = matched pairs
  const persistentFindings = persistentPairs.map((p) => ({
    oldTitle: oldFindings[p.oldIdx].title,
    newTitle: newFindings[p.newIdx].title,
    category: newFindings[p.newIdx].category,
    similarity: Math.round(p.similarity * 100) / 100,
  }));

  const fixedCount = fixedFindings.length;
  const newCount = newFindingsUnmatched.length;
  const persistentCount = persistentFindings.length;

  // Improvement = fixed / (fixed + persistent), or 0 if no old findings
  const denominator = fixedCount + persistentCount;
  const improvementPct = denominator > 0
    ? Math.round((fixedCount / denominator) * 100)
    : 0;

  const summaryData: RevisionSummaryData = {
    fixedFindings,
    newFindings: newFindingsUnmatched,
    persistentFindings,
    improvementPct,
  };

  // Upsert
  const result = await pool.query(
    `INSERT INTO revision_summaries (old_review_id, new_review_id, fixed_count, new_count, persistent_count, summary)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (old_review_id, new_review_id) DO UPDATE SET
       fixed_count = $3,
       new_count = $4,
       persistent_count = $5,
       summary = $6,
       created_at = NOW()
     RETURNING *`,
    [oldReviewId, newReviewId, fixedCount, newCount, persistentCount, JSON.stringify(summaryData)]
  );

  return rowToRevisionSummary(result.rows[0]);
}

/**
 * Get a specific revision summary comparing two reviews.
 */
export async function getRevisionSummary(
  oldReviewId: string,
  newReviewId: string
): Promise<RevisionSummaryRow | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(
    "SELECT * FROM revision_summaries WHERE old_review_id = $1 AND new_review_id = $2",
    [oldReviewId, newReviewId]
  );
  if (result.rows.length === 0) return null;
  return rowToRevisionSummary(result.rows[0]);
}

/**
 * List all revision summaries where the given review is the "new" side.
 * Useful for showing how a review compares to all its predecessors.
 */
export async function listRevisionSummariesForReview(
  reviewId: string
): Promise<RevisionSummaryRow[]> {
  if (!pool) return [];
  await ensureSchema();

  const result = await pool.query(
    "SELECT * FROM revision_summaries WHERE new_review_id = $1 ORDER BY created_at DESC",
    [reviewId]
  );
  return result.rows.map(rowToRevisionSummary);
}

// ---------------------------------------------------------------------------
// Finding Impact Matrix (category x severity heatmap)
// ---------------------------------------------------------------------------

export interface ImpactMatrixCell {
  category: string;
  severity: string;
  count: number;
}

export interface ImpactMatrixData {
  cells: ImpactMatrixCell[];
  totalReviews: number;
}

/**
 * Build a matrix of finding category x severity with counts across all
 * completed reviews. Uses the `category` field from the merged feedback
 * findings and the `severity` field.
 */
export async function getFindingImpactMatrix(): Promise<ImpactMatrixData | null> {
  if (!pool) return null;
  await ensureSchema();

  const result = await pool.query(`
    WITH
    completed AS (
      SELECT id, feedback->'findings' AS findings
      FROM reviews
      WHERE status = 'done'
        AND deleted_at IS NULL
        AND feedback IS NOT NULL
        AND jsonb_typeof(feedback->'findings') = 'array'
    ),
    exploded AS (
      SELECT
        COALESCE(f.value->>'category', 'other') AS category,
        COALESCE(f.value->>'severity', 'suggestion') AS severity
      FROM completed c, jsonb_array_elements(c.findings) AS f(value)
    ),
    matrix AS (
      SELECT category, severity, COUNT(*)::int AS count
      FROM exploded
      GROUP BY category, severity
    ),
    review_count AS (
      SELECT COUNT(*)::int AS cnt FROM completed
    )
    SELECT
      json_build_object(
        'cells', COALESCE((SELECT json_agg(json_build_object('category', category, 'severity', severity, 'count', count)) FROM matrix), '[]'::json),
        'totalReviews', (SELECT cnt FROM review_count)
      ) AS data
  `);

  const raw = result.rows[0].data;
  return {
    cells: (raw.cells as { category: string; severity: string; count: string }[]).map((c) => ({
      category: c.category,
      severity: c.severity,
      count: Number(c.count),
    })),
    totalReviews: Number(raw.totalReviews),
  };
}
