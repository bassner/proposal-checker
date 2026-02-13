"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FeedbackList } from "@/components/feedback-list";
import { ThinkingBubble } from "@/components/thinking-bubble";
import { Button } from "@/components/ui/button";
import { GraduationCap, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { MergedFeedback } from "@/types/review";

interface SharedReview {
  id: string;
  status: string;
  provider: string;
  fileName: string | null;
  createdAt: string;
  feedback: MergedFeedback | null;
  userName: string;
}

export default function SharedReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [review, setReview] = useState<SharedReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/shared/${token}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to load shared review");
          return;
        }
        const data = await res.json();
        setReview(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load shared review");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

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
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <BackgroundOrbs />
      <div className="relative mx-auto w-full px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <GraduationCap className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Shared Review</h1>
              {review.fileName && <p className="text-xs text-white/40">{review.fileName}</p>}
              <p className="text-xs text-white/30">by {review.userName}</p>
            </div>
          </div>
          <Link href="/">
            <Button variant="outline" className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>
        <FeedbackList feedback={review.feedback} />
        <footer className="mt-12 pb-4 text-center text-xs text-white/20">
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
      <div className="relative mx-auto min-h-screen w-full max-w-[960px] px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
            <GraduationCap className="h-5 w-5 text-blue-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">Shared Review</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function BackgroundOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
    </div>
  );
}
