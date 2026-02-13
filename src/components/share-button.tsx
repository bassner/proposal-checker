"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Share2, Copy, Check, Link2Off, Loader2 } from "lucide-react";

interface ShareButtonProps {
  reviewId: string;
  initialShareToken?: string | null;
}

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "shared"; token: string; copied: boolean }
  | { status: "error"; message: string };

export function ShareButton({ reviewId, initialShareToken }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>(
    initialShareToken
      ? { status: "shared", token: initialShareToken, copied: false }
      : { status: "idle" }
  );
  const [open, setOpen] = useState(false);

  const share = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/review/${reviewId}/share`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: "error", message: body.error || "Failed to create share link" });
        return;
      }
      const { shareToken } = await res.json();
      setState({ status: "shared", token: shareToken, copied: false });
    } catch {
      setState({ status: "error", message: "Failed to create share link" });
    }
  }, [reviewId]);

  const unshare = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/review/${reviewId}/share`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        setState({ status: "error", message: body.error || "Failed to revoke share link" });
        return;
      }
      setState({ status: "idle" });
    } catch {
      setState({ status: "error", message: "Failed to revoke share link" });
    }
  }, [reviewId]);

  const copyUrl = useCallback(async () => {
    if (state.status !== "shared") return;
    const url = `${window.location.origin}/shared/${state.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setState((prev) => (prev.status === "shared" ? { ...prev, copied: true } : prev));
      setTimeout(() => {
        setState((prev) => (prev.status === "shared" ? { ...prev, copied: false } : prev));
      }, 2000);
    } catch {
      // Clipboard API may fail in some contexts — ignore
    }
  }, [state]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Share2 className="mr-1.5 h-3.5 w-3.5" />
          {state.status === "shared" ? "Shared" : "Share"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 border-white/10 bg-slate-900 p-4"
      >
        {state.status === "idle" && (
          <div className="space-y-3">
            <p className="text-sm text-white/60">
              Create a link that any logged-in user can use to view this review.
            </p>
            <Button
              onClick={share}
              size="sm"
              className="w-full"
            >
              <Share2 className="mr-2 h-3.5 w-3.5" />
              Create Share Link
            </Button>
          </div>
        )}

        {state.status === "loading" && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-white/40" />
          </div>
        )}

        {state.status === "shared" && (
          <div className="space-y-3">
            <p className="text-sm text-white/60">
              Anyone with this link and a login can view the review.
            </p>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5">
                <p className="truncate text-xs text-white/80">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/shared/${state.token}`
                    : `/shared/${state.token}`}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyUrl}
                className="shrink-0 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
              >
                {state.copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={unshare}
              className="w-full border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Link2Off className="mr-2 h-3.5 w-3.5" />
              Revoke Share Link
            </Button>
          </div>
        )}

        {state.status === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-red-400">{state.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState({ status: "idle" })}
              className="w-full border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
            >
              Try Again
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
