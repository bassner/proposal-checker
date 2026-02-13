import { requireRole } from "@/lib/auth/helpers";
import { getPool, ensureSchemaPublic } from "@/lib/db";
import { readPdf } from "@/lib/uploads";
import { hashPDFContent } from "@/lib/pdf/hash";

/**
 * POST /api/admin/migrate-versions — One-time migration endpoint.
 *
 * Step A: Backfill content_hash for reviews with PDFs on disk.
 * Step B: Create indexes for duplicate detection.
 * Step C: Auto-link existing reviews by (owner, filename, mode) into version groups.
 *
 * Uses an advisory lock to prevent concurrent runs. Admin-only.
 */
export async function POST() {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
  await ensureSchemaPublic();

  // Use a dedicated client for the entire migration
  const client = await pool.connect();
  let released = false;
  try {
    // Advisory lock to prevent concurrent runs
    const lockResult = await client.query(
      "SELECT pg_try_advisory_lock(hashtext('migrate-versions')) AS locked"
    );
    if (!lockResult.rows[0]?.locked) {
      released = true;
      client.release();
      return Response.json(
        { error: "Migration is already running" },
        { status: 409 }
      );
    }

    const stats = {
      hashesBackfilled: 0,
      hashesSkippedMissing: 0,
      indexesCreated: 0,
      groupsCreated: 0,
      reviewsLinked: 0,
    };

    // Step A: Backfill content hashes
    console.log("[migrate] Step A: Backfilling content hashes...");
    const unhashed = await client.query(
      `SELECT id, pdf_path FROM reviews
       WHERE pdf_path IS NOT NULL AND content_hash IS NULL AND deleted_at IS NULL
       ORDER BY created_at ASC`
    );

    const BATCH_SIZE = 50;
    for (let i = 0; i < unhashed.rows.length; i += BATCH_SIZE) {
      const batch = unhashed.rows.slice(i, i + BATCH_SIZE);
      for (const row of batch) {
        try {
          const buffer = await readPdf(row.pdf_path);
          if (!buffer) {
            stats.hashesSkippedMissing++;
            continue;
          }
          const hash = hashPDFContent(buffer);
          await client.query(
            "UPDATE reviews SET content_hash = $1 WHERE id = $2 AND content_hash IS NULL",
            [hash, row.id]
          );
          stats.hashesBackfilled++;
        } catch (err) {
          console.error(`[migrate] Failed to hash review ${row.id}:`, err);
          stats.hashesSkippedMissing++;
        }
      }
      console.log(`[migrate] Hashed ${Math.min(i + BATCH_SIZE, unhashed.rows.length)}/${unhashed.rows.length} reviews`);
    }

    // Step B: Create indexes (non-concurrent — safe for one-time migration on small dataset)
    console.log("[migrate] Step B: Creating indexes...");
    try {
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_reviews_content_hash
         ON reviews(content_hash) WHERE content_hash IS NOT NULL`
      );
      stats.indexesCreated++;
    } catch (err) {
      console.warn("[migrate] Index idx_reviews_content_hash may already exist:", err);
    }

    try {
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_reviews_dup_detect
         ON reviews(content_hash, review_mode, COALESCE(student_id, user_id))
         WHERE status = 'done' AND deleted_at IS NULL`
      );
      stats.indexesCreated++;
    } catch (err) {
      console.warn("[migrate] Index idx_reviews_dup_detect may already exist:", err);
    }

    // Step C: Auto-link by owner + filename
    console.log("[migrate] Step C: Auto-linking reviews by owner + filename...");
    const groups = await client.query(
      `SELECT COALESCE(student_id, user_id) AS owner_id, file_name, review_mode,
              array_agg(id ORDER BY created_at ASC, id ASC) AS review_ids
       FROM reviews
       WHERE file_name IS NOT NULL
         AND status = 'done'
         AND deleted_at IS NULL
         AND created_at > NOW() - INTERVAL '90 days'
         AND LENGTH(regexp_replace(file_name, '\\.[^.]+$', '')) >= 8
         AND id NOT IN (SELECT review_id FROM review_versions)
       GROUP BY COALESCE(student_id, user_id), file_name, review_mode
       HAVING COUNT(*) >= 2
       ORDER BY MIN(created_at) ASC`
    );

    const MAX_GROUP_SIZE = 10;
    for (const group of groups.rows) {
      const reviewIds = (group.review_ids as string[]).slice(0, MAX_GROUP_SIZE);
      if (reviewIds.length < 2) continue;

      try {
        await client.query("BEGIN");
        const uuidResult = await client.query("SELECT gen_random_uuid() AS id");
        const groupId = uuidResult.rows[0].id as string;

        let actualLinked = 0;
        for (let v = 0; v < reviewIds.length; v++) {
          const insertResult = await client.query(
            "INSERT INTO review_versions (group_id, review_id, version_number) VALUES ($1, $2, $3) ON CONFLICT (review_id) DO NOTHING RETURNING review_id",
            [groupId, reviewIds[v], v + 1]
          );
          if (insertResult.rowCount && insertResult.rowCount > 0) actualLinked++;
        }
        await client.query("COMMIT");
        stats.groupsCreated++;
        stats.reviewsLinked += actualLinked;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[migrate] Failed to create group for ${group.file_name}:`, err);
      }
    }

    console.log("[migrate] Migration complete:", stats);

    // Step D: Release advisory lock
    await client.query("SELECT pg_advisory_unlock(hashtext('migrate-versions'))");

    return Response.json(stats);
  } catch (err) {
    // Try to release lock on error
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('migrate-versions'))");
    } catch { /* best effort */ }
    console.error("[migrate] Migration failed:", err);
    return Response.json(
      { error: "Migration failed" },
      { status: 500 }
    );
  } finally {
    if (!released) client.release();
  }
}
