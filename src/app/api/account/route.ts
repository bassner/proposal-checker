import { requireAuth } from "@/lib/auth/helpers";
import { eraseAllUserData, logAuditEvent } from "@/lib/db";
import { unlink, rm } from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/proposal-checker-uploads";

/**
 * DELETE /api/account — Erase all user data (GDPR Art. 17).
 * Deletes all reviews, annotations, audit logs, PDFs, and the user record.
 */
export async function DELETE() {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const userId = session.user.id;

  // Log before erasure (this log entry will also be deleted as part of the process)
  await logAuditEvent(
    "00000000-0000-0000-0000-000000000000",
    userId,
    session.user.email ?? null,
    "account.erased",
    { userName: session.user.name },
    session.user.name
  ).catch(() => {});

  // Erase all DB data, get review IDs for PDF cleanup
  const deletedReviewIds = await eraseAllUserData(userId);

  // Delete PDFs and rendered page images from disk
  let filesDeleted = 0;
  for (const reviewId of deletedReviewIds) {
    const safeId = reviewId.replace(/[^a-zA-Z0-9-]/g, "");
    const pdfPath = path.join(UPLOAD_DIR, `${safeId}.pdf`);
    const pagesDir = path.join(UPLOAD_DIR, `${safeId}-pages`);

    try {
      await unlink(pdfPath);
      filesDeleted++;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`[account] Failed to delete PDF ${pdfPath}:`, err);
      }
    }

    try {
      await rm(pagesDir, { recursive: true, force: true });
    } catch {
      // Pages dir may not exist
    }
  }

  console.log(
    `[account] User ${userId} erased: ${deletedReviewIds.length} reviews, ${filesDeleted} PDFs deleted`
  );

  return Response.json({ ok: true, reviewsDeleted: deletedReviewIds.length });
}
