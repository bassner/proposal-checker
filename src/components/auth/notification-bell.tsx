"use client";

import { Bell, CheckCheck, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";
import { useState } from "react";

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center size-10 rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white md:size-8"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-white/10 bg-zinc-900 p-0 text-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <span className="text-xs font-medium text-white/70">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="flex items-center gap-1 text-[10px] text-white/40 transition-colors hover:text-white/70"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-white/30">
              No new notifications
            </div>
          ) : (
            notifications.map((n) => (
              <Link
                key={n.id}
                href={`/review/${n.reviewId}`}
                onClick={() => {
                  markRead(n.id);
                  setOpen(false);
                }}
                className="flex items-start gap-2.5 border-b border-white/5 px-3 py-2.5 transition-colors hover:bg-white/5 last:border-b-0"
              >
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug text-white/80">{n.message}</p>
                  <p className="mt-0.5 text-[10px] text-white/30">
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
