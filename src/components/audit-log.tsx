"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquare,
  Share2,
  RefreshCw,
  Trash2,
  PenLine,
  Activity,
} from "lucide-react";

interface AuditEvent {
  id: string;
  reviewId: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_META: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  "review.created": {
    label: "Review created",
    icon: FileText,
    color: "text-blue-500 dark:text-blue-400",
  },
  "review.retried": {
    label: "Review retried",
    icon: RefreshCw,
    color: "text-amber-500 dark:text-amber-400",
  },
  "review.deleted": {
    label: "Review deleted",
    icon: Trash2,
    color: "text-red-500 dark:text-red-400",
  },
  "annotation.updated": {
    label: "Annotations updated",
    icon: PenLine,
    color: "text-purple-500 dark:text-purple-400",
  },
  "comment.added": {
    label: "Comment added",
    icon: MessageSquare,
    color: "text-green-500 dark:text-green-400",
  },
  "comment.deleted": {
    label: "Comment deleted",
    icon: MessageSquare,
    color: "text-orange-500 dark:text-orange-400",
  },
  "share.created": {
    label: "Share link created",
    icon: Share2,
    color: "text-cyan-500 dark:text-cyan-400",
  },
  "share.revoked": {
    label: "Share link revoked",
    icon: Share2,
    color: "text-slate-500 dark:text-slate-400",
  },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? {
    label: action,
    icon: Activity,
    color: "text-slate-400 dark:text-slate-500",
  };
}

function formatDetails(action: string, details: Record<string, unknown> | null): string | null {
  if (!details) return null;

  switch (action) {
    case "review.created": {
      const parts: string[] = [];
      if (details.provider) parts.push(`Provider: ${details.provider}`);
      if (details.mode) parts.push(`Mode: ${details.mode}`);
      if (details.fileName) parts.push(`File: ${details.fileName}`);
      if (details.groups) parts.push(`${details.groups} check groups`);
      return parts.length > 0 ? parts.join(" | ") : null;
    }
    case "review.retried": {
      const parts: string[] = [];
      if (details.retryCount != null) parts.push(`Attempt #${details.retryCount}`);
      if (details.provider) parts.push(`Provider: ${details.provider}`);
      return parts.length > 0 ? parts.join(" | ") : null;
    }
    case "review.deleted":
      return details.fileName ? `File: ${details.fileName}` : null;
    case "annotation.updated":
      return details.count ? `${details.count} annotation(s)` : null;
    case "comment.added":
    case "comment.deleted":
      return details.findingIndex != null ? `Finding #${Number(details.findingIndex) + 1}` : null;
    case "share.created": {
      const parts: string[] = [];
      if (details.expiration) parts.push(`Expires: ${details.expiration}`);
      if (details.hasPassword) parts.push("Password-protected");
      return parts.length > 0 ? parts.join(" | ") : null;
    }
    default:
      return null;
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AuditLog({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}/audit`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load audit log");
        return;
      }
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      setError("Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    if (open && events.length === 0 && !loading) {
      fetchAuditLog();
    }
  }, [open, events.length, loading, fetchAuditLog]);

  return (
    <section className="mt-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-medium text-slate-600 backdrop-blur-xl transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
        aria-expanded={open}
      >
        <Clock className="h-4 w-4 text-slate-400 dark:text-white/40" />
        <span className="flex-1">Activity Log</span>
        {events.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500 dark:bg-white/10 dark:text-white/40">
            {events.length}
          </span>
        )}
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-400 dark:text-white/40" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400 dark:text-white/40" />
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white/80 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
          {loading && (
            <p className="py-4 text-center text-xs text-slate-400 dark:text-white/40">
              Loading activity log...
            </p>
          )}

          {error && (
            <p className="py-4 text-center text-xs text-red-500 dark:text-red-400">
              {error}
            </p>
          )}

          {!loading && !error && events.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-400 dark:text-white/40">
              No activity recorded yet.
            </p>
          )}

          {!loading && !error && events.length > 0 && (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute bottom-0 left-[15px] top-0 w-px bg-slate-200 dark:bg-white/10" />

              <ul className="space-y-3">
                {events.map((event) => {
                  const meta = getActionMeta(event.action);
                  const Icon = meta.icon;
                  const details = formatDetails(event.action, event.details);

                  return (
                    <li key={event.id} className="relative flex gap-3 pl-0">
                      {/* Icon dot */}
                      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-white/10">
                        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-slate-700 dark:text-white/80">
                            {meta.label}
                          </span>
                          <span
                            className="shrink-0 text-xs text-slate-400 dark:text-white/30"
                            title={formatFullTime(event.createdAt)}
                          >
                            {formatTime(event.createdAt)}
                          </span>
                        </div>

                        {event.userEmail && (
                          <p className="text-xs text-slate-400 dark:text-white/40">
                            by {event.userEmail}
                          </p>
                        )}

                        {details && (
                          <p className="mt-0.5 text-xs text-slate-400 dark:text-white/30">
                            {details}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
