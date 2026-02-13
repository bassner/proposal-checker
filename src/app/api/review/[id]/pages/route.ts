import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById } from "@/lib/db";
import { readPdf } from "@/lib/uploads";
import { renderPDFPages } from "@/lib/pdf/render";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// In-memory cache for rendered pages (keyed by review ID).
// Entries are evicted after 30 minutes to bound memory usage.
const PAGE_CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  pages: { pageNumber: number; imageBase64: string }[];
  createdAt: number;
}

const globalPages = globalThis as unknown as {
  __pageCache?: Map<string, CacheEntry>;
};
if (!globalPages.__pageCache) {
  globalPages.__pageCache = new Map();
}
const pageCache = globalPages.__pageCache;

function getCachedPages(reviewId: string): CacheEntry["pages"] | null {
  const entry = pageCache.get(reviewId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > PAGE_CACHE_TTL_MS) {
    pageCache.delete(reviewId);
    return null;
  }
  return entry.pages;
}

/**
 * GET /api/review/[id]/pages — Returns rendered PDF page images.
 *
 * Optional query param: ?page=N to get a single page (1-indexed).
 * Without ?page, returns metadata (page count) to avoid sending all images at once.
 *
 * Single-page response: PNG binary with Content-Type: image/png.
 * Metadata response: JSON { pageCount: number }.
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

  // Render (or use cache)
  let pages = getCachedPages(id);
  if (!pages) {
    const buffer = await readPdf(review.pdfPath);
    if (!buffer) {
      return Response.json({ error: "PDF file no longer available" }, { status: 404 });
    }
    const rendered = await renderPDFPages(buffer);
    pages = rendered;
    pageCache.set(id, { pages, createdAt: Date.now() });
  }

  // If ?page=N is provided, return that single page as a PNG image
  const pageParam = request.nextUrl.searchParams.get("page");
  if (pageParam) {
    const pageNum = parseInt(pageParam, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return Response.json({ error: "Invalid page number" }, { status: 400 });
    }
    const page = pages.find((p) => p.pageNumber === pageNum);
    if (!page) {
      return Response.json({ error: "Page not found" }, { status: 404 });
    }
    const binary = Buffer.from(page.imageBase64, "base64");
    return new Response(binary, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(binary.length),
      },
    });
  }

  // No page param: return metadata
  return Response.json({
    pageCount: pages.length,
    pages: pages.map((p) => p.pageNumber),
  });
}
