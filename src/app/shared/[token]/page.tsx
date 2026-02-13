"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { FeedbackList } from "@/components/feedback-list";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { Button } from "@/components/ui/button";
import { PrintButton, CopyMarkdownButton } from "@/components/export-button";
import { GraduationCap, ArrowLeft, Lock, Clock } from "lucide-react";
import Link from "next/link";
import type { MergedFeedback, Annotations } from "@/types/review";
import { useComments } from "@/hooks/use-comments";

interface SharedReview {
  id: string;
  status: string;
  provider: string;
  fileName: string | null;
  createdAt: string;
  feedback: MergedFeedback | null;
  userName: string;
  annotations?: Annotations;
  canComment?: boolean;
}

export default function SharedReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [review, setReview] = useState<SharedReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const fetchReview = useCallback(async (pwd?: string) => {
    setLoading(true);
    setError(null);
    setPasswordError(null);

    try {
      // If a password is provided, POST to /verify; otherwise GET the shared review
      const res = pwd
        ? await fetch(`/api/shared/${token}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pwd }),
          })
        : await fetch(`/api/shared/${token}`);

      if (res.status === 410) {
        setExpired(true);
        setLoading(false);
        return;
      }

      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setPasswordError(body.error || "Too many attempts. Try again later.");
        setLoading(false);
        return;
      }

      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        if (body.passwordRequired) {
          setNeedsPassword(true);
          if (pwd) {
            setPasswordError("Incorrect password");
          }
          setLoading(false);
          return;
        }
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to load shared review");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setReview(data);
      setNeedsPassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shared review");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  const handlePasswordSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!password.trim()) return;
      fetchReview(password);
    },
    [password, fetchReview]
  );

  // ── Expired state ──
  if (expired) {
    return (
      <PageShell>
        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-center backdrop-blur-xl">
          <Clock className="mx-auto mb-3 h-8 w-8 text-amber-400/60" />
          <p className="text-sm font-medium text-amber-300">Share link expired</p>
          <p className="mt-1 text-xs text-amber-300/50">
            This share link is no longer valid. Ask the review owner for a new link.
          </p>
          <Link href="/" className="mt-4 inline-block">
            <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  // ── Password prompt ──
  if (needsPassword && !review) {
    return (
      <PageShell>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="mx-auto max-w-xs text-center">
            <Lock className="mx-auto mb-3 h-8 w-8 text-blue-400/60" />
            <p className="text-sm font-medium text-white/80">Password required</p>
            <p className="mt-1 text-xs text-white/40">
              This shared review is password protected.
            </p>
            <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(null);
                }}
                placeholder="Enter password"
                autoFocus
                className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-center text-sm text-white/80 placeholder:text-white/25 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10"
              />
              {passwordError && (
                <p className="text-xs text-red-400">{passwordError}</p>
              )}
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={!password.trim() || loading}
              >
                {loading ? "Checking..." : "Unlock"}
              </Button>
            </form>
          </div>
        </div>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center gap-2 py-16">
          <ThinkingBubble />
          <span className="text-xs text-white/40">Loading shared review...</span>
        </div>
      </PageShell>
    );
  }

  if (error || !review) {
    return (
      <PageShell>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-xl">
          <p className="text-sm font-medium text-white/60">
            {error || "Shared review not found"}
          </p>
          <Link href="/" className="mt-4 inline-block">
            <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  if (review.status !== "done" || !review.feedback) {
    return (
      <PageShell>
        <div className="mt-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6 backdrop-blur-xl">
          <p className="text-sm font-medium text-yellow-300">Review not available</p>
          <p className="mt-2 text-sm text-yellow-300/60">
            This review has not completed yet or has no results.
          </p>
          <Link href="/" className="mt-4 inline-block">
            <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <SharedResultsView review={review} />
  );
}

function SharedResultsView({ review }: { review: SharedReview }) {
  const canComment = review.canComment === true;
  const { annotations, addComment, deleteComment, submitting } = useComments(
    review.id,
    review.annotations
  );

  // Use comment-managed annotations if supervisor, otherwise use static annotations
  const displayAnnotations = canComment ? annotations : (review.annotations ?? {});

  const handleAddComment = canComment
    ? async (findingIndex: number, text: string) => { await addComment(findingIndex, text); }
    : undefined;

  const handleDeleteComment = canComment
    ? async (findingIndex: number, commentId: string) => { await deleteComment(findingIndex, commentId); }
    : undefined;

  return (
    <div className="print-root relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <BackgroundOrbs />
      <div className="relative mx-auto w-full px-3 py-4 sm:px-6 sm:py-8">
        <div className="print-header">
          <h1 className="text-base font-semibold">Shared Review</h1>
          {review.fileName && <p className="text-sm text-gray-600">{review.fileName}</p>}
          <p className="text-xs text-gray-400">by {review.userName}</p>
          <p className="text-xs text-gray-400">{new Date().toLocaleDateString()}</p>
        </div>
        <header className="no-print mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <GraduationCap className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Shared Review</h1>
              {review.fileName && <p className="text-xs text-white/40">{review.fileName}</p>}
              <p className="text-xs text-white/30">by {review.userName}</p>
            </div>
          </div>
          <nav aria-label="Page actions" className="flex items-center gap-2">
            <PrintButton />
            <CopyMarkdownButton feedback={review.feedback!} fileName={review.fileName} />
            <Link href="/">
              <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </nav>
        </header>
        <main id="main-content">
          <FeedbackList
            feedback={review.feedback!}
            annotations={displayAnnotations}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            commentSubmitting={submitting}
          />
        </main>
        <footer className="mt-12 pb-4 text-center text-xs text-white/20" role="contentinfo">
          Created with &#10084;&#65039; by{" "}
          <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-white/30 transition-colors hover:text-white/50">
            @bassner
          </a>
        </footer>
      </div>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <BackgroundOrbs />
      <div className="relative mx-auto min-h-screen w-full max-w-[960px] px-3 py-4 sm:px-6 sm:py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
            <GraduationCap className="h-5 w-5 text-blue-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">Shared Review</h1>
        </header>
        <main id="main-content">
          {children}
        </main>
      </div>
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
