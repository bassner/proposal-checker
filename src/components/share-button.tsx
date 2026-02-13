"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Share2, Copy, Check, Link2Off, Loader2, Lock, Clock } from "lucide-react";

interface ShareButtonProps {
  reviewId: string;
  initialShareToken?: string | null;
  initialExpiresAt?: string | null;
  initialHasPassword?: boolean;
}

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "shared"; token: string; copied: boolean; expiresAt: string | null; hasPassword: boolean }
  | { status: "error"; message: string };

const EXPIRATION_OPTIONS = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
  { value: "never", label: "Never" },
] as const;

function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h remaining`;
  }
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export function ShareButton({
  reviewId,
  initialShareToken,
  initialExpiresAt,
  initialHasPassword,
}: ShareButtonProps) {
  const [state, setState] = useState<ShareState>(
    initialShareToken
      ? {
          status: "shared",
          token: initialShareToken,
          copied: false,
          expiresAt: initialExpiresAt ?? null,
          hasPassword: initialHasPassword ?? false,
        }
      : { status: "idle" }
  );
  const [open, setOpen] = useState(false);
  const [expiration, setExpiration] = useState("never");
  const [password, setPassword] = useState("");

  const share = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/review/${reviewId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiration,
          ...(password ? { password } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: "error", message: body.error || "Failed to create share link" });
        return;
      }
      const data = await res.json();
      setState({
        status: "shared",
        token: data.shareToken,
        copied: false,
        expiresAt: data.expiresAt ?? null,
        hasPassword: data.hasPassword ?? false,
      });
      setPassword("");
    } catch {
      setState({ status: "error", message: "Failed to create share link" });
    }
  }, [reviewId, expiration, password]);

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
          className="border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <Share2 className="mr-1.5 h-3.5 w-3.5" />
          {state.status === "shared" ? "Shared" : "Share"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"
      >
        {state.status === "idle" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-white/60">
              Create a link that any logged-in user can use to view this review.
            </p>

            {/* Expiration selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-white/50">Link expires after</label>
              <Select value={expiration} onValueChange={setExpiration}>
                <SelectTrigger className="h-8 w-full border-slate-200 bg-white text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
                  {EXPIRATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-slate-700 dark:text-white/80">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-white/50">
                Password protection <span className="text-white/30">(optional)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-white/30" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave empty for no password"
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/25 dark:focus:border-white/20 dark:focus:ring-white/10"
                />
              </div>
            </div>

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
            <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-white/40" />
          </div>
        )}

        {state.status === "shared" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-white/60">
              Anyone with this link and a login can view the review.
            </p>

            {/* Status badges */}
            <div className="flex flex-wrap gap-1.5">
              {state.expiresAt && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  <Clock className="h-3 w-3" />
                  {formatTimeRemaining(state.expiresAt)}
                </span>
              )}
              {state.hasPassword && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                  <Lock className="h-3 w-3" />
                  Password protected
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
                <p className="truncate text-xs text-slate-700 dark:text-white/80">
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
            <p className="text-sm text-red-500 dark:text-red-400">{state.message}</p>
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
