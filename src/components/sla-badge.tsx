"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Clock, AlertTriangle, CheckCircle2, Minus } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SLAData {
  id: string;
  reviewId: string;
  findingIndex: number;
  deadline: string;
  severity: string;
  setBy: string;
  setByName: string | null;
  createdAt: string;
}

type SLAStatus = "on-track" | "warning" | "overdue" | "none";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSLAStatus(deadline: string): SLAStatus {
  const now = Date.now();
  const deadlineMs = new Date(deadline).getTime();
  const diff = deadlineMs - now;

  if (diff < 0) return "overdue";
  if (diff < 24 * 60 * 60 * 1000) return "warning";
  return "on-track";
}

function formatTimeRemaining(deadline: string): string {
  const now = Date.now();
  const deadlineMs = new Date(deadline).getTime();
  const diff = deadlineMs - now;
  const absDiff = Math.abs(diff);

  const minutes = Math.floor(absDiff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let timeStr: string;
  if (days > 0) {
    const remainingHours = hours % 24;
    timeStr = remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    timeStr = remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  } else {
    timeStr = `${minutes}m`;
  }

  return diff < 0 ? `${timeStr} overdue` : `${timeStr} left`;
}

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<
  SLAStatus,
  { bgClass: string; textClass: string; icon: typeof Clock }
> = {
  "on-track": {
    bgClass: "bg-green-500/15",
    textClass: "text-green-600 dark:text-green-400",
    icon: CheckCircle2,
  },
  warning: {
    bgClass: "bg-amber-500/15",
    textClass: "text-amber-600 dark:text-amber-400",
    icon: Clock,
  },
  overdue: {
    bgClass: "bg-red-500/15",
    textClass: "text-red-600 dark:text-red-400",
    icon: AlertTriangle,
  },
  none: {
    bgClass: "bg-slate-500/10",
    textClass: "text-slate-400 dark:text-white/30",
    icon: Minus,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SLABadgeProps {
  sla?: SLAData | null;
  className?: string;
}

export function SLABadge({ sla, className }: SLABadgeProps) {
  // Re-render every minute to keep the time display accurate
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!sla) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [sla]);

  if (!sla) {
    const style = STATUS_STYLES.none;
    const Icon = style.icon;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          style.bgClass,
          style.textClass,
          className
        )}
      >
        <Icon className="h-3 w-3" />
        No SLA
      </span>
    );
  }

  const status = getSLAStatus(sla.deadline);
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  const timeText = formatTimeRemaining(sla.deadline);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        style.bgClass,
        style.textClass,
        className
      )}
      title={`Deadline: ${new Date(sla.deadline).toLocaleString()} | Severity: ${sla.severity}${sla.setByName ? ` | Set by: ${sla.setByName}` : ""}`}
    >
      <Icon className="h-3 w-3" />
      {timeText}
    </span>
  );
}
