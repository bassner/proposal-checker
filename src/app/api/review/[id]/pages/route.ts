import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById } from "@/lib/db";
import { readPdf, savePageImages, readPageImage, getPageImageCount } from "@/lib/uploads";
import { renderPDFPages } from "@/lib/pdf/render";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// In-memory page count cache to avoid hitting disk for metadata requests.
// Evicts after 30 min. Lightweight — only stores page count, not image data.
const PAGE_COUNT_TTL_MS = 30 * 60 * 1000;
const globalMeta = globalThis as unknown as {
  __pageCountCache?: Map<string, { count: number; createdAt: number }>;
};
if (!globalMeta.__pageCountCache) {
  globalMeta.__pageCountCache = new Map();
}
const pageCountCache = globalMeta.__pageCountCache;

/**
 * GET /api/review/[id]/pages — Returns rendered PDF page images.
 *
 * Optional query param: ?page=N to get a single page (1-indexed).
 * Without ?page, returns metadata: { pageCount, pages }.
 *
 * Images are rendered once and stored on disk alongside the PDF.
 * Subsequent requests read from disk, avoiding re-rendering.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Ownership / supervisor check (same IDOR prevention as other endpoints)
  const isOwner = review.userId === session.user.id;
  const isSupervisor = session.user.role === "admin" || session.user.role === "phd";
  if (!isOwner && !isSupervisor) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  if (!review.pdfPath) {
    return Response.json({ error: "PDF not available for this review" }, { status: 404 });
  }

  // Check if pages are already rendered to disk
  let pageCount = 0;
  const cached = pageCountCache.get(id);
  if (cached && Date.now() - cached.createdAt < PAGE_COUNT_TTL_MS) {
    pageCount = cached.count;
  } else {
    pageCount = await getPageImageCount(id);
    if (pageCount > 0) {
      pageCountCache.set(id, { count: pageCount, createdAt: Date.now() });
    }
  }

  // If not rendered yet, render and save to disk
  if (pageCount === 0) {
    const buffer = await readPdf(review.pdfPath);
    if (!buffer) {
      return Response.json({ error: "PDF file no longer available" }, { status: 404 });
    }
    const rendered = await renderPDFPages(buffer);
    await savePageImages(id, rendered);
    pageCount = rendered.length;
    pageCountCache.set(id, { count: pageCount, createdAt: Date.now() });
  }

  // If ?page=N is provided, return that single page as a PNG image
  const pageParam = request.nextUrl.searchParams.get("page");
  if (pageParam) {
    const pageNum = parseInt(pageParam, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > pageCount) {
      return Response.json({ error: "Invalid page number" }, { status: 400 });
    }
    const imageBuffer = await readPageImage(id, pageNum);
    if (!imageBuffer) {
      return Response.json({ error: "Page image not found" }, { status: 404 });
    }
    const uint8 = new Uint8Array(imageBuffer);
    return new Response(uint8, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(uint8.length),
      },
    });
  }

  // No page param: return metadata
  return Response.json({
    pageCount,
    pages: Array.from({ length: pageCount }, (_, i) => i + 1),
  });
}
