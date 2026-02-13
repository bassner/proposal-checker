import { requireRole } from "@/lib/auth/helpers";
import {
  isAvailable,
  bulkDeleteReviews,
  bulkAddTag,
  bulkRemoveTag,
  bulkExportReviews,
  logAuditEvent,
  getTagsForReviews,
} from "@/lib/db";
import { cacheInvalidate } from "@/lib/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TAG_LENGTH = 50;
const TAG_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/;
const MAX_BULK_IDS = 100;

type BulkAction = "delete" | "add_tag" | "remove_tag" | "export";

interface BulkRequestBody {
  action?: unknown;
  reviewIds?: unknown;
  tag?: unknown;
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * POST /api/admin/bulk-actions
 *
 * Accepts { action, reviewIds, tag? } and performs the requested bulk operation.
 * Requires admin role.
 */
export async function POST(request: Request) {
  let session;
  try {
    session = await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  let body: BulkRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate action
  const action = body.action as string;
  const validActions: BulkAction[] = ["delete", "add_tag", "remove_tag", "export"];
  if (!validActions.includes(action as BulkAction)) {
    return Response.json(
      { error: `Invalid action — must be one of: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate reviewIds
  if (!Array.isArray(body.reviewIds) || body.reviewIds.length === 0) {
    return Response.json(
      { error: "reviewIds must be a non-empty array" },
      { status: 400 }
    );
  }
  if (body.reviewIds.length > MAX_BULK_IDS) {
    return Response.json(
      { error: `Cannot process more than ${MAX_BULK_IDS} reviews at once` },
      { status: 400 }
    );
  }
  const reviewIds = body.reviewIds as string[];
  for (const id of reviewIds) {
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      return Response.json(
        { error: `Invalid review ID: ${id}` },
        { status: 400 }
      );
    }
  }

  // Validate tag for tag actions
  if (action === "add_tag" || action === "remove_tag") {
    const rawTag = typeof body.tag === "string" ? body.tag.trim().toLowerCase() : "";
    if (!rawTag) {
      return Response.json({ error: "Tag is required for tag actions" }, { status: 400 });
    }
    if (rawTag.length > MAX_TAG_LENGTH) {
      return Response.json(
        { error: `Tag must be at most ${MAX_TAG_LENGTH} characters` },
        { status: 400 }
      );
    }
    if (!TAG_RE.test(rawTag)) {
      return Response.json(
        { error: "Tag must start with a letter or number and contain only letters, numbers, spaces, hyphens, or underscores" },
        { status: 400 }
      );
    }
  }

  try {
    switch (action as BulkAction) {
      case "delete": {
        const count = await bulkDeleteReviews(reviewIds);
        // Invalidate cache for each deleted review
        for (const id of reviewIds) {
          cacheInvalidate(`review:${id}`);
        }
        // Audit log for each (fire-and-forget)
        for (const id of reviewIds) {
          logAuditEvent(id, session.user.id, session.user.email ?? null, "review.bulk_deleted", {
            bulkCount: reviewIds.length,
          });
        }
        return Response.json({ ok: true, deleted: count });
      }

      case "add_tag": {
        const tag = (body.tag as string).trim().toLowerCase();
        const count = await bulkAddTag(reviewIds, tag, session.user.id!);
        return Response.json({ ok: true, tagged: count, tag });
      }

      case "remove_tag": {
        const tag = (body.tag as string).trim().toLowerCase();
        const count = await bulkRemoveTag(reviewIds, tag);
        return Response.json({ ok: true, untagged: count, tag });
      }

      case "export": {
        const reviews = await bulkExportReviews(reviewIds);
        const tagsMap = await getTagsForReviews(reviewIds);

        const header = "review_id,user_email,user_name,file_name,status,provider,review_mode,workflow_status,tags,created_at,completed_at";
        const lines = reviews.map((r) => {
          const tags = tagsMap.get(r.id)?.map((t) => t.tag).join("; ") ?? "";
          return [
            r.id,
            escapeCSV(r.userEmail),
            escapeCSV(r.userName),
            r.fileName ? escapeCSV(r.fileName) : "",
            r.status,
            r.provider,
            r.reviewMode,
            r.workflowStatus,
            escapeCSV(tags),
            r.createdAt,
            r.completedAt ?? "",
          ].join(",");
        });
        const csv = [header, ...lines].join("\n");
        const timestamp = new Date().toISOString().slice(0, 10);

        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="reviews-export-${timestamp}.csv"`,
          },
        });
      }
    }
  } catch (err) {
    console.error("[api] Bulk action failed:", err);
    return Response.json(
      { error: "Bulk action failed" },
      { status: 500 }
    );
  }
}
