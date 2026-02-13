"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

interface PdfViewerProps {
  reviewId: string;
  /** Page number to scroll to (1-indexed), driven by finding selection. */
  targetPage?: number | null;
  onClose: () => void;
}

export function PdfViewer({ reviewId, targetPage, onClose }: PdfViewerProps) {
  const [pageCount, setPageCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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

/** Lazily loads a single PDF page image using IntersectionObserver. */
import { forwardRef } from "react";

const PageImage = forwardRef<HTMLDivElement, {
  reviewId: string;
  pageNumber: number;
  isTarget: boolean;
}>(function PageImage({ reviewId, pageNumber, isTarget }, ref) {
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
    </div>
  );
});
