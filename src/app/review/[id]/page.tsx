"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ReviewStepper } from "@/components/review-stepper";
import { FeedbackList } from "@/components/feedback-list";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { Button } from "@/components/ui/button";
import { useReviewStream, useCompletedReview } from "@/hooks/use-review";
import { UserMenu } from "@/components/auth/user-menu";
import { ShareButton } from "@/components/share-button";
import { PrintButton, CopyMarkdownButton, DownloadCsvButton, DownloadJsonButton } from "@/components/export-button";
import { GraduationCap, RotateCcw, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { MergedFeedback, ReviewMode, Annotations, CheckGroupState } from "@/types/review";
import { useAnnotations } from "@/hooks/use-annotations";
import { useComments } from "@/hooks/use-comments";
import { useConflicts } from "@/hooks/use-conflicts";
import { TimeEstimate } from "@/components/time-estimate";
import { DeleteReviewButton } from "@/components/delete-review-button";
import { ReviewStats } from "@/components/review-stats";
import { AuditLog } from "@/components/audit-log";
import { ImprovementSummaryCard } from "@/components/improvement-summary";
import { FindingsHeatmap } from "@/components/findings-heatmap";
import { ReviewTags } from "@/components/review-tags";

/**
 * Review progress/results page at `/review/[id]`.
 *
 * Dual-source: tries SSE stream first (live reviews). If the stream returns 404
 * (session evicted from memory), falls back to fetching from the database.
 */
export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { state, notFound } = useReviewStream(id);
  const { review, loading: dbLoading, error: dbError } = useCompletedReview(id, notFound);

  const isRunning = state.status === "running";
  const hasResult = !!state.result;
  const hasError = state.status === "error";

  // ── DB fallback: session not in memory ──────────────────────────────────
  if (notFound) {
    if (dbLoading) {
      return (
        <PageShell title="Loading Review..." subtitle="Fetching results...">
          <div className="flex items-center justify-center gap-2 py-16">
            <ThinkingBubble />
            <span className="text-xs text-slate-400 dark:text-white/40">Loading review...</span>
          </div>
        </PageShell>
      );
    }

    if (review?.status === "done" && review.feedback) {
      return <ResultsView feedback={review.feedback} fileName={review.fileName} reviewId={id} shareToken={review.shareToken} shareExpiresAt={review.shareExpiresAt} shareHasPassword={review.shareHasPassword} reviewMode={review.reviewMode} initialAnnotations={review.annotations} isOwner={review.isOwner !== false} supervisorName={review.supervisorName} studentName={review.studentName} />;
    }

    if (review?.status === "error") {
      return (
        <PageShell title="Review Failed">
          <StatusCard variant="error" title="Review Failed" message={review.errorMessage ?? "An unknown error occurred"}>
            {review.canRetry && <RetryButton reviewId={id} />}
          </StatusCard>
        </PageShell>
      );
    }

    if (review?.status === "running") {
      const isStale = review.isStale;
      return (
        <PageShell title={isStale ? "Review Interrupted" : "Review In Progress"}>
          <StatusCard
            variant="warning"
            title={isStale ? "Review was interrupted" : "Review is still running"}
            message={isStale
              ? "The server restarted while this review was in progress."
              : "This review may still be running on the server. Please refresh in a moment."}
          >
            {isStale && review.canRetry && <RetryButton reviewId={id} />}
          </StatusCard>
        </PageShell>
      );
    }

    return (
      <PageShell title="Review Not Found">
        <StatusCard variant="neutral" title={dbError ?? "This review could not be found."} buttonLabel="Start New Review" />
      </PageShell>
    );
  }

  // ── Live SSE: results view ──────────────────────────────────────────────
  if (hasResult) {
    return <ResultsView feedback={state.result!} reviewId={id} reviewMode={state.mode ?? undefined} checkGroups={state.checkGroups} isOwner />;
  }

  // ── Live SSE: processing / error view ───────────────────────────────────
  return (
    <PageShell title="Proposal Checker" subtitle={state.status === "idle" ? "Connecting..." : state.mode === "thesis" ? "Reviewing thesis..." : "Reviewing proposal..."}>
      {isRunning && (
        <div className="mb-4 flex items-center justify-center gap-2 py-2" aria-live="polite" role="status">
          <ThinkingBubble />
          <span className="text-xs text-slate-400 dark:text-white/40">{state.mode === "thesis" ? "Analyzing thesis..." : "Analyzing proposal..."}</span>
          <TimeEstimate state={state} />
        </div>
      )}

      {state.status !== "idle" && (
        <aside aria-label="Review progress" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-xl sm:p-5">
          <h2 className="mb-4 text-sm font-medium text-slate-500 dark:text-white/60">Progress</h2>
          <ReviewStepper state={state} />
        </aside>
      )}

      {hasError && (
        <StatusCard variant="error" title="Review Failed" message={state.error!}>
          <RetryButton reviewId={id} />
        </StatusCard>
      )}
    </PageShell>
  );
}

// ── Shared components ─────────────────────────────────────────────────────

/** Full-width results view with feedback list (shared by live SSE + DB fallback). */
function ResultsView({ feedback: initialFeedback, fileName, reviewId, shareToken, shareExpiresAt, shareHasPassword, reviewMode, checkGroups, initialAnnotations, isOwner, supervisorName, studentName }: { feedback: MergedFeedback; fileName?: string | null; reviewId: string; shareToken?: string | null; shareExpiresAt?: string | null; shareHasPassword?: boolean; reviewMode?: ReviewMode; checkGroups?: CheckGroupState[]; initialAnnotations?: Annotations; isOwner?: boolean; supervisorName?: string | null; studentName?: string | null }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isSupervisor = role === "admin" || role === "phd";
  const canAnnotate = isOwner !== false; // Owner can annotate (toggle status)
  const canComment = isSupervisor; // Admin/PhD can comment on any review

  // Local feedback state — allows adding manual findings without full page reload
  const [feedback, setFeedback] = useState<MergedFeedback>(initialFeedback);

  const { annotations, toggleAnnotation } = useAnnotations(reviewId, initialAnnotations);
  const { annotations: commentAnnotations, addComment, replyComment, resolveThread, deleteComment, submitting: commentSubmitting } = useComments(reviewId, initialAnnotations);
  const { conflicts } = useConflicts(reviewId, isSupervisor);

  // Page filter state (driven by heatmap clicks)
  const [pageFilter, setPageFilter] = useState<number | null>(null);

  const handlePageClick = useCallback((page: number) => {
    setPageFilter((prev) => (prev === page ? null : page));
  }, []);

  // Focus the results heading when the results view mounts
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    resultsHeadingRef.current?.focus();
  }, []);

  // Merge annotation status from useAnnotations with comments from useComments
  const mergedAnnotations: Annotations = {};
  const allKeys = new Set([...Object.keys(annotations), ...Object.keys(commentAnnotations)]);
  for (const key of allKeys) {
    const ann = annotations[key];
    const comm = commentAnnotations[key];
    mergedAnnotations[key] = {
      ...ann,
      ...comm,
      updatedAt: ann?.updatedAt ?? comm?.updatedAt ?? new Date().toISOString(),
      ...(ann?.status ? { status: ann.status } : {}),
      ...(comm?.comments?.length ? { comments: comm.comments } : ann?.comments?.length ? { comments: ann.comments } : {}),
    };
  }

  const handleAddComment = canComment
    ? async (findingIndex: number, text: string) => {
        await addComment(findingIndex, text);
      }
    : undefined;

  const handleDeleteComment = canComment
    ? async (findingIndex: number, commentId: string) => {
        await deleteComment(findingIndex, commentId);
      }
    : undefined;

  const handleReplyComment = canComment
    ? async (findingIndex: number, parentId: string, text: string) => {
        await replyComment(findingIndex, parentId, text);
      }
    : undefined;

  const handleResolveThread = canComment
    ? async (findingIndex: number, commentId: string, status: "resolved" | "open") => {
        await resolveThread(findingIndex, commentId, status);
      }
    : undefined;

  const handleAddFinding = isSupervisor
    ? async (finding: { severity: import("@/types/review").Severity; category: string; title: string; description: string; locations: { page: number | null; section: string | null; quote: string }[] }) => {
        const res = await fetch(`/api/review/${reviewId}/findings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finding),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to add finding");
        }
        const data = await res.json();
        // Update local feedback state with the new finding
        setFeedback((prev) => ({
          ...prev,
          findings: [...prev.findings, data.finding],
        }));
      }
    : undefined;

  return (
    <div className="print-root relative min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <BackgroundOrbs />
      <div className="relative mx-auto w-full px-3 py-4 sm:px-6 sm:py-8">
        <div className="print-header">
          <h1 className="text-base font-semibold">{reviewMode === "thesis" ? "Thesis" : "Proposal"} Review Results</h1>
          {fileName && <p className="text-sm text-gray-600">{fileName}</p>}
          <p className="text-xs text-gray-400">{new Date().toLocaleDateString()}</p>
        </div>
        <header className="no-print mb-6 space-y-3">
          {/* Row 1: Logo + Title + User menu (wraps below on narrow screens) */}
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <IconBadge />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 ref={resultsHeadingRef} tabIndex={-1} className="text-lg font-semibold text-slate-900 dark:text-white outline-none">Review Results</h1>
                  {reviewMode === "thesis" && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
                      thesis
                    </span>
                  )}
                </div>
                {fileName && <p className="text-xs text-slate-400 dark:text-white/40">{fileName}</p>}
                {(supervisorName || studentName) && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400 dark:text-white/35">
                    {supervisorName && <span>Supervisor: <span className="font-medium text-slate-500 dark:text-white/50">{supervisorName}</span></span>}
                    {studentName && <span>Student: <span className="font-medium text-slate-500 dark:text-white/50">{studentName}</span></span>}
                  </div>
                )}
              </div>
            </div>
            <nav aria-label="User navigation" className="ml-auto">
              <UserMenu />
            </nav>
          </div>
          {/* Row 2: Tags */}
          <ReviewTags reviewId={reviewId} editable={isOwner !== false || role === "admin" || role === "phd"} />
          {/* Row 3: Action buttons */}
          <nav aria-label="Review actions" className="flex flex-wrap items-center gap-2">
            <ReviewAnotherButton size="sm" />
            <ShareButton reviewId={reviewId} initialShareToken={shareToken} initialExpiresAt={shareExpiresAt} initialHasPassword={shareHasPassword} />
            <PrintButton />
            <CopyMarkdownButton feedback={feedback} fileName={fileName} />
            <DownloadCsvButton feedback={feedback} annotations={mergedAnnotations} fileName={fileName} reviewMode={reviewMode} />
            <DownloadJsonButton feedback={feedback} annotations={mergedAnnotations} fileName={fileName} reviewMode={reviewMode} />
            {(isOwner || role === "admin") && (
              <DeleteReviewButton reviewId={reviewId} fileName={fileName} variant="button" />
            )}
          </nav>
        </header>
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          <ReviewStats feedback={feedback} annotations={mergedAnnotations} checkGroups={checkGroups} />
          <FindingsHeatmap findings={feedback.findings} onPageClick={handlePageClick} activePage={pageFilter} />
          <div className="lg:col-span-2">
            <ImprovementSummaryCard reviewId={reviewId} />
          </div>
        </div>
        <main id="main-content">
          <FeedbackList
            feedback={feedback}
            annotations={mergedAnnotations}
            onAnnotate={canAnnotate ? toggleAnnotation : undefined}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            onReplyComment={handleReplyComment}
            onResolveThread={handleResolveThread}
            commentSubmitting={commentSubmitting}
            onPageClick={handlePageClick}
            conflicts={conflicts}
            reviewId={reviewId}
            currentUserId={session?.user?.id ?? undefined}
            pageFilter={pageFilter}
            onAddFinding={handleAddFinding}
          />
        </main>
        {role === "admin" && (
          <div className="no-print">
            <AuditLog reviewId={reviewId} />
          </div>
        )}
        <Footer />
      </div>
    </div>
  );
}

/** Narrow page shell for non-results states (processing, loading, errors). */
function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <BackgroundOrbs />
      <div className="relative mx-auto min-h-screen w-full max-w-[960px] px-3 py-4 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <IconBadge />
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
              {subtitle && <p className="text-xs text-slate-400 dark:text-white/40">{subtitle}</p>}
            </div>
          </div>
          <nav aria-label="User navigation">
            <UserMenu />
          </nav>
        </header>
        <main id="main-content">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}

/** Status card for error / warning / neutral states with a "Review Another" action. */
function StatusCard({ variant, title, message, buttonLabel = "Review Another", children }: {
  variant: "error" | "warning" | "neutral";
  title: string;
  message?: string;
  buttonLabel?: string;
  children?: React.ReactNode;
}) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-300",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-500/20 dark:bg-yellow-500/5 dark:text-yellow-300",
    neutral: "border-slate-200 bg-white/80 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60",
  };
  const msgStyles = {
    error: "text-red-500/70 dark:text-red-300/60",
    warning: "text-yellow-600/70 dark:text-yellow-300/60",
    neutral: "text-slate-400 dark:text-white/40",
  };
  return (
    <div className={`mt-6 rounded-2xl border p-6 backdrop-blur-xl ${styles[variant]}`}>
      <p className="text-sm font-medium">{title}</p>
      {message && <p className={`mt-2 text-sm ${msgStyles[variant]}`}>{message}</p>}
      <div className="mt-4 flex items-center gap-2">
        {children}
        <ReviewAnotherButton label={buttonLabel} />
      </div>
    </div>
  );
}

/** Retry button — calls POST /api/review/[id]/retry and reloads the page on success. */
function RetryButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}/retry`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRetryError(body.error || "Retry failed");
        setRetrying(false);
        return;
      }
      // Reload the page to reconnect to the new SSE stream
      router.refresh();
      window.location.reload();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Retry failed");
      setRetrying(false);
    }
  }, [reviewId, router]);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleRetry}
        disabled={retrying}
        className="border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
        {retrying ? "Retrying..." : "Retry Review"}
      </Button>
      {retryError && <span className="text-xs text-red-500 dark:text-red-400">{retryError}</span>}
    </div>
  );
}

function ReviewAnotherButton({ size, className = "", label = "Review Another" }: { size?: "sm" | "default"; className?: string; label?: string }) {
  return (
    <Link href="/" className={className}>
      <Button variant="outline" size={size} className="border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white">
        <RotateCcw className={size === "sm" ? "mr-1.5 h-3.5 w-3.5" : "mr-2 h-4 w-4"} />
        {label}
      </Button>
    </Link>
  );
}

function IconBadge() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 backdrop-blur-sm dark:bg-blue-500/20">
      <GraduationCap className="h-5 w-5 text-blue-500 dark:text-blue-400" />
    </div>
  );
}

function BackgroundOrbs() {
  return (
    <div className="background-orbs pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10" />
      <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/5 blur-3xl dark:bg-purple-500/10" />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 pb-4 text-center text-xs text-slate-300 dark:text-white/20" role="contentinfo">
      Created with &#10084;&#65039; by{" "}
      <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-slate-400 transition-colors hover:text-slate-600 dark:text-white/30 dark:hover:text-white/50">
        @bassner
      </a>
    </footer>
  );
}
