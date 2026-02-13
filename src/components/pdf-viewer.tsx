"use client";

import { useState, useEffect, useRef, useCallback, forwardRef } from "react";
import { X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import type { Finding } from "@/types/review";

/** Quotes to highlight on a specific page, grouped from findings. */
interface PageHighlight {
  quote: string;
  severity: string;
}

interface PdfViewerProps {
  reviewId: string;
  /** Page number to scroll to (1-indexed), driven by finding selection. */
  targetPage?: number | null;
  /** All findings, used to extract quote highlights per page. */
  findings?: Finding[];
  onClose: () => void;
}

/** Build a map of page number -> highlights from findings. */
function buildHighlightMap(findings: Finding[]): Map<number, PageHighlight[]> {
  const map = new Map<number, PageHighlight[]>();
  for (const finding of findings) {
    for (const loc of finding.locations) {
      if (loc.page == null) continue;
      const existing = map.get(loc.page) ?? [];
      // Avoid duplicate quotes on the same page
      if (!existing.some((h) => h.quote === loc.quote)) {
        existing.push({ quote: loc.quote, severity: finding.severity });
      }
      map.set(loc.page, existing);
    }
  }
  return map;
}

export function PdfViewer({ reviewId, targetPage, findings, onClose }: PdfViewerProps) {
  const [pageCount, setPageCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const highlightMap = findings ? buildHighlightMap(findings) : new Map();

  // Fetch page count on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchMeta() {
      try {
        const res = await fetch(`/api/review/${reviewId}/pages`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load PDF pages");
        }
        const data = await res.json();
        if (!cancelled) {
          setPageCount(data.pageCount);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
          setLoading(false);
        }
      }
    }
    fetchMeta();
    return () => { cancelled = true; };
  }, [reviewId]);

  // Scroll to target page when it changes
  useEffect(() => {
    if (targetPage == null || targetPage < 1) return;
    const el = pageRefs.current.get(targetPage);
    if (el) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }
  }, [targetPage]);

  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        <span className="ml-2 text-xs text-white/40">Loading PDF...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-xs text-red-400">{error}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-white/40 hover:text-white/60"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-xs font-medium text-white/60">
          PDF Preview ({pageCount} page{pageCount !== 1 ? "s" : ""})
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollToPage(1)}
            className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/60"
            aria-label="Scroll to first page"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => scrollToPage(pageCount)}
            className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/60"
            aria-label="Scroll to last page"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/60"
            aria-label="Close PDF viewer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable page list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-2 space-y-3">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
          <PageImage
            key={pageNum}
            reviewId={reviewId}
            pageNumber={pageNum}
            isTarget={targetPage === pageNum}
            highlights={highlightMap.get(pageNum)}
            ref={(el) => {
              if (el) pageRefs.current.set(pageNum, el);
              else pageRefs.current.delete(pageNum);
            }}
          />
        ))}
      </div>
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "border-l-red-500/60 bg-red-500/10",
  major: "border-l-orange-500/60 bg-orange-500/10",
  minor: "border-l-yellow-500/60 bg-yellow-500/10",
  suggestion: "border-l-blue-500/60 bg-blue-500/10",
};

/** Lazily loads a single PDF page image using IntersectionObserver. */
const PageImage = forwardRef<HTMLDivElement, {
  reviewId: string;
  pageNumber: number;
  isTarget: boolean;
  highlights?: PageHighlight[];
}>(function PageImage({ reviewId, pageNumber, isTarget, highlights }, ref) {
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Only show highlights when this page is the active target
  const showHighlights = isTarget && highlights && highlights.length > 0;

  return (
    <div
      ref={ref}
      className={`relative rounded-lg border transition-colors ${
        isTarget
          ? "border-blue-500/50 ring-2 ring-blue-500/30"
          : "border-white/10"
      }`}
    >
      {/* Page number badge */}
      <div className="absolute left-2 top-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/70 backdrop-blur-sm">
        Page {pageNumber}
      </div>

      {/* Finding highlight count badge */}
      {highlights && highlights.length > 0 && (
        <div className="absolute right-2 top-2 z-10 rounded bg-amber-500/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {highlights.length} finding{highlights.length !== 1 ? "s" : ""}
        </div>
      )}

      <div ref={sentinelRef} className="w-full">
        {visible ? (
          <>
            {!loaded && (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-white/20" />
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/review/${reviewId}/pages?page=${pageNumber}`}
              alt={`PDF page ${pageNumber}`}
              className={`w-full rounded-lg ${loaded ? "" : "hidden"}`}
              onLoad={() => setLoaded(true)}
            />
          </>
        ) : (
          <div className="h-48 w-full" aria-hidden="true" />
        )}
      </div>

      {/* Quote highlight overlay — shown when this page is the active target */}
      {showHighlights && loaded && (
        <div className="absolute inset-x-0 bottom-0 z-10 max-h-[60%] overflow-y-auto rounded-b-lg bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6">
          <div className="space-y-1">
            {highlights.map((h, i) => {
              // Strip bold markers for clean display
              const cleanQuote = h.quote.replace(/\*\*/g, "");
              return (
                <div
                  key={i}
                  className={`rounded border-l-2 px-2 py-1 text-[10px] leading-snug text-white/80 ${
                    SEVERITY_COLORS[h.severity] ?? "border-l-white/30 bg-white/10"
                  }`}
                >
                  <span className="italic">&ldquo;{cleanQuote}&rdquo;</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
