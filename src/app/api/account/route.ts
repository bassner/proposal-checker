import { requireAuth } from "@/lib/auth/helpers";
import { eraseAllUserData, logAuditEvent, getAdminCount } from "@/lib/db";
import { validatePath } from "@/lib/uploads";
import { unlink, rm } from "fs/promises";

/**
 * DELETE /api/account — Erase all user data (GDPR Art. 17).
 * Deletes all reviews, annotations, audit logs, PDFs, and the user record.
 *
 * Requires JSON body: { confirm: "DELETE" }
 */
export async function DELETE(request: Request) {
  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  // Server-side confirmation check (Issue 8)
  let body: { confirm?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.confirm !== "DELETE") {
    return Response.json(
      { error: 'Missing confirmation. Send { "confirm": "DELETE" } in request body.' },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  // Block last-admin deletion (Issue 9)
  if (session.user.role === "admin") {
    const adminCount = await getAdminCount();
    if (adminCount <= 1) {
      return Response.json(
        { error: "Cannot delete last admin account" },
        { status: 403 }
      );
    }
  }

  // Log before erasure (this log entry will also be deleted as part of the process)
  await logAuditEvent(
    "00000000-0000-0000-0000-000000000000",
    userId,
    session.user.email ?? null,
    "account.erased",
    { userName: session.user.name },
    session.user.name
  ).catch(() => {});

  // Erase all DB data, get PDF paths for file cleanup
  const { deletedPdfPaths } = await eraseAllUserData(userId);

  // Delete PDFs and rendered page images from disk using stored paths
  let filesDeleted = 0;
  const fileErrors: string[] = [];
  for (const pdfPath of deletedPdfPaths) {
    try {
      // Validate path is within upload dir before deleting (prevents arbitrary file deletion)
      const validated = await validatePath(pdfPath);
      await unlink(validated);
      filesDeleted++;

      // Also clean up rendered page images directory alongside the PDF
      const pagesDir = validated.replace(/\.pdf$/, "-pages");
      await rm(pagesDir, { recursive: true, force: true }).catch(() => {});
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`[account] Failed to delete PDF ${pdfPath}:`, err);
        fileErrors.push(pdfPath);
      }
    }
  }

  console.log(
    `[account] User ${userId} erased: ${deletedPdfPaths.length} reviews, ${filesDeleted} PDFs deleted`
  );

  return Response.json({
    ok: true,
    reviewsDeleted: deletedPdfPaths.length,
    ...(fileErrors.length > 0 && { warnings: [`${fileErrors.length} PDF file(s) could not be deleted`] }),
  });
}
