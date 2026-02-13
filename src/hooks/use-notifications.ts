"use client";

import { useState, useEffect, useCallback } from "react";

interface Notification {
  id: string;
  userId: string;
  reviewId: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const POLL_INTERVAL = 30_000; // 30 seconds

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      // silently ignore — network errors are transient
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {
      // optimistic update — don't revert on failure
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications([]);
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
    } catch {
      // optimistic update
    }
  }, []);

  return { notifications, loading, unreadCount: notifications.length, markRead, markAllRead, refetch: fetchNotifications };
}
