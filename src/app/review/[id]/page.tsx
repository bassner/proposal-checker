"use client";

import { useParams } from "next/navigation";
import { ReviewStepper } from "@/components/review-stepper";
import { FeedbackList } from "@/components/feedback-list";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { Button } from "@/components/ui/button";
import { useReviewStream, useCompletedReview } from "@/hooks/use-review";
import { UserMenu } from "@/components/auth/user-menu";
import { ShareButton } from "@/components/share-button";
import { PrintButton, CopyMarkdownButton } from "@/components/export-button";
import { GraduationCap, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { MergedFeedback, Annotations } from "@/types/review";
import { useAnnotations } from "@/hooks/use-annotations";

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
            <span className="text-xs text-white/40">Loading review...</span>
          </div>
        </PageShell>
      );
    }

    if (review?.status === "done" && review.feedback) {
      return <ResultsView feedback={review.feedback} fileName={review.fileName} reviewId={id} shareToken={review.shareToken} initialAnnotations={review.annotations} />;
    }

    if (review?.status === "error") {
      return (
        <PageShell title="Review Failed">
          <StatusCard variant="error" title="Review Failed" message={review.errorMessage ?? "An unknown error occurred"} />
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
              ? "The server restarted while this review was in progress. Please try again."
              : "This review may still be running on the server. Please refresh in a moment."}
          />
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
    return <ResultsView feedback={state.result!} reviewId={id} />;
  }

  // ── Live SSE: processing / error view ───────────────────────────────────
  return (
    <PageShell title="Proposal Checker" subtitle={state.status === "idle" ? "Connecting..." : "Reviewing proposal..."}>
      {isRunning && (
        <div className="mb-4 flex items-center justify-center gap-2 py-2">
          <ThinkingBubble />
          <span className="text-xs text-white/40">Analyzing proposal...</span>
        </div>
      )}

      {state.status !== "idle" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl sm:p-5">
          <h2 className="mb-4 text-sm font-medium text-white/60">Progress</h2>
          <ReviewStepper state={state} />
        </div>
      )}

      {hasError && (
        <StatusCard variant="error" title="Review Failed" message={state.error!} />
      )}
    </PageShell>
  );
}

// ── Shared components ─────────────────────────────────────────────────────

/** Full-width results view with feedback list (shared by live SSE + DB fallback). */
function ResultsView({ feedback, fileName, reviewId, shareToken, initialAnnotations }: { feedback: MergedFeedback; fileName?: string | null; reviewId: string; shareToken?: string | null; initialAnnotations?: Annotations }) {
  const { annotations, toggleAnnotation } = useAnnotations(reviewId, initialAnnotations);

  return (
    <div className="print-root relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <BackgroundOrbs />
      <div className="relative mx-auto w-full px-3 py-4 sm:px-6 sm:py-8">
        <div className="print-header">
          <h1 className="text-base font-semibold">Proposal Review Results</h1>
          {fileName && <p className="text-sm text-gray-600">{fileName}</p>}
          <p className="text-xs text-gray-400">{new Date().toLocaleDateString()}</p>
        </div>
        <div className="no-print mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <IconBadge />
            <div>
              <h1 className="text-lg font-semibold text-white">Review Results</h1>
              {fileName && <p className="text-xs text-white/40">{fileName}</p>}
            </div>
            <ReviewAnotherButton size="sm" />
            <ShareButton reviewId={reviewId} initialShareToken={shareToken} />
            <PrintButton />
            <CopyMarkdownButton feedback={feedback} fileName={fileName} />
          </div>
          <UserMenu />
        </div>
        <FeedbackList feedback={feedback} annotations={annotations} onAnnotate={toggleAnnotation} />
        <Footer />
      </div>
    </div>
  );
}

/** Narrow page shell for non-results states (processing, loading, errors). */
function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <BackgroundOrbs />
      <div className="relative mx-auto min-h-screen w-full max-w-[960px] px-3 py-4 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <IconBadge />
            <div>
              <h1 className="text-lg font-semibold text-white">{title}</h1>
              {subtitle && <p className="text-xs text-white/40">{subtitle}</p>}
            </div>
          </div>
          <UserMenu />
        </div>
        {children}
        <Footer />
      </div>
    </div>
  );
}

/** Status card for error / warning / neutral states with a "Review Another" action. */
function StatusCard({ variant, title, message, buttonLabel = "Review Another" }: {
  variant: "error" | "warning" | "neutral";
  title: string;
  message?: string;
  buttonLabel?: string;
}) {
  const styles = {
    error: "border-red-500/20 bg-red-500/5 text-red-300",
    warning: "border-yellow-500/20 bg-yellow-500/5 text-yellow-300",
    neutral: "border-white/10 bg-white/5 text-white/60",
  };
  const msgStyles = {
    error: "text-red-300/60",
    warning: "text-yellow-300/60",
    neutral: "text-white/40",
  };
  return (
    <div className={`mt-6 rounded-2xl border p-6 backdrop-blur-xl ${styles[variant]}`}>
      <p className="text-sm font-medium">{title}</p>
      {message && <p className={`mt-2 text-sm ${msgStyles[variant]}`}>{message}</p>}
      <ReviewAnotherButton className="mt-4" label={buttonLabel} />
    </div>
  );
}

function ReviewAnotherButton({ size, className = "", label = "Review Another" }: { size?: "sm" | "default"; className?: string; label?: string }) {
  return (
    <Link href="/" className={className}>
      <Button variant="outline" size={size} className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
        <RotateCcw className={size === "sm" ? "mr-1.5 h-3.5 w-3.5" : "mr-2 h-4 w-4"} />
        {label}
      </Button>
    </Link>
  );
}

function IconBadge() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
      <GraduationCap className="h-5 w-5 text-blue-400" />
    </div>
  );
}

function BackgroundOrbs() {
  return (
    <div className="background-orbs pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 pb-4 text-center text-xs text-white/20">
      Created with ❤️ by{" "}
      <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-white/30 transition-colors hover:text-white/50">
        @bassner
      </a>
    </footer>
  );
}
