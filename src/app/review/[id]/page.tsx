"use client";

import { useParams } from "next/navigation";
import { ReviewStepper } from "@/components/review-stepper";
import { FeedbackList } from "@/components/feedback-list";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { Button } from "@/components/ui/button";
import { useReviewStream, useCompletedReview } from "@/hooks/use-review";
import { UserMenu } from "@/components/auth/user-menu";
import { GraduationCap, RotateCcw } from "lucide-react";
import Link from "next/link";

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
    // Loading from DB
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

    // DB returned the review with feedback
    if (review?.status === "done" && review.feedback) {
      return (
        <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
          </div>
          <div className="relative mx-auto w-full px-6 py-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
                  <GraduationCap className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-white">Review Results</h1>
                  {review.fileName && (
                    <p className="text-xs text-white/40">{review.fileName}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/">
                  <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Review Another
                  </Button>
                </Link>
                <UserMenu />
              </div>
            </div>
            <FeedbackList feedback={review.feedback} />
            <footer className="mt-12 pb-4 text-center text-xs text-white/20">
              Created with ❤️ by{" "}
              <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/50 transition-colors">@bassner</a>
            </footer>
          </div>
        </div>
      );
    }

    // DB returned an error review
    if (review?.status === "error") {
      return (
        <PageShell title="Review Failed">
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 backdrop-blur-xl">
            <p className="text-sm font-medium text-red-300">Review Failed</p>
            <p className="mt-2 text-sm text-red-300/60">{review.errorMessage ?? "An unknown error occurred"}</p>
            <Link href="/">
              <Button variant="outline" className="mt-4 border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                <RotateCcw className="mr-2 h-4 w-4" />
                Review Another
              </Button>
            </Link>
          </div>
        </PageShell>
      );
    }

    // DB returned a stale running review (interrupted by server restart)
    if (review?.status === "running") {
      return (
        <PageShell title={review.isStale ? "Review Interrupted" : "Review In Progress"}>
          <div className="mt-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6 backdrop-blur-xl">
            <p className="text-sm font-medium text-yellow-300">
              {review.isStale ? "Review was interrupted" : "Review is still running"}
            </p>
            <p className="mt-2 text-sm text-yellow-300/60">
              {review.isStale
                ? "The server restarted while this review was in progress. Please try again."
                : "This review may still be running on the server. Please refresh in a moment."}
            </p>
            <Link href="/">
              <Button variant="outline" className="mt-4 border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                <RotateCcw className="mr-2 h-4 w-4" />
                Review Another
              </Button>
            </Link>
          </div>
        </PageShell>
      );
    }

    // Not found in DB either, or DB error
    return (
      <PageShell title="Review Not Found">
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <p className="text-sm font-medium text-white/60">
            {dbError ?? "This review could not be found."}
          </p>
          <Link href="/">
            <Button variant="outline" className="mt-4 border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
              <RotateCcw className="mr-2 h-4 w-4" />
              Start New Review
            </Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  // ── Live SSE: full-screen results view ──────────────────────────────────
  if (hasResult) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
        </div>
        <div className="relative mx-auto w-full px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
                <GraduationCap className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Review Results</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Review Another
                </Button>
              </Link>
              <UserMenu />
            </div>
          </div>
          <FeedbackList feedback={state.result!} />
          <footer className="mt-12 pb-4 text-center text-xs text-white/20">
            Created with ❤️ by{" "}
            <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/50 transition-colors">@bassner</a>
          </footer>
        </div>
      </div>
    );
  }

  // ── Live SSE: processing / error view ───────────────────────────────────
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto min-h-screen w-full max-w-[960px] px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <GraduationCap className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Proposal Checker</h1>
              <p className="text-xs text-white/40">Reviewing proposal...</p>
            </div>
          </div>
          <UserMenu />
        </div>

        {isRunning && (
          <div className="mb-4 flex items-center justify-center gap-2 py-2">
            <ThinkingBubble />
            <span className="text-xs text-white/40">Analyzing proposal...</span>
          </div>
        )}

        {state.status !== "idle" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <h2 className="mb-4 text-sm font-medium text-white/60">Progress</h2>
            <ReviewStepper state={state} />
          </div>
        )}

        {hasError && (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 backdrop-blur-xl">
            <p className="text-sm font-medium text-red-300">Review Failed</p>
            <p className="mt-2 text-sm text-red-300/60">{state.error}</p>
            <Link href="/">
              <Button variant="outline" className="mt-4 border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                <RotateCcw className="mr-2 h-4 w-4" />
                Review Another
              </Button>
            </Link>
          </div>
        )}

        <footer className="mt-12 pb-4 text-center text-xs text-white/20">
          Created with ❤️ by{" "}
          <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/50 transition-colors">@bassner</a>
        </footer>
      </div>
    </div>
  );
}

/** Minimal page shell for non-streaming states (DB fallback views). */
function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto min-h-screen w-full max-w-[960px] px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <GraduationCap className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">{title}</h1>
              {subtitle && <p className="text-xs text-white/40">{subtitle}</p>}
            </div>
          </div>
          <UserMenu />
        </div>
        {children}
      </div>
    </div>
  );
}
