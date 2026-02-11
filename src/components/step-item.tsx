"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import type { StepStatus } from "@/types/review";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StepItemProps {
  label: string;
  status: StepStatus;
  children?: ReactNode;
  isLast?: boolean;
}

const statusIcons: Record<StepStatus, ReactNode> = {
  pending: <Circle className="h-5 w-5 text-white/30" />,
  active: <Loader2 className="h-5 w-5 animate-spin text-blue-400" />,
  done: <Check className="h-5 w-5 text-emerald-400" />,
  error: <X className="h-5 w-5 text-red-400" />,
};

export function StepItem({ label, status, children, isLast }: StepItemProps) {
  return (
    <div className="flex gap-3">
      {/* Vertical line + icon */}
      <div className="relative flex w-8 shrink-0 flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border transition-all",
            status === "pending" && "border-white/10 bg-white/5",
            status === "active" && "border-blue-400/50 bg-blue-400/10",
            status === "done" && "border-emerald-400/50 bg-emerald-400/10",
            status === "error" && "border-red-400/50 bg-red-400/10"
          )}
        >
          {statusIcons[status]}
        </div>
        {!isLast && (
          <div
            className={cn(
              "absolute left-1/2 top-8 bottom-0 -translate-x-1/2 w-px",
              status === "done" ? "bg-emerald-400/30" : "bg-white/10"
            )}
          />
        )}
      </div>

      {/* Content */}
      <div className={cn("min-w-0 flex-1 pb-6", isLast && "pb-0")}>
        <div className="flex min-h-8 items-center">
          <p
            className={cn(
              "text-sm font-medium leading-none transition-colors",
              status === "pending" && "text-white/40",
              status === "active" && "text-blue-300",
              status === "done" && "text-emerald-300",
              status === "error" && "text-red-300"
            )}
          >
            {label}
          </p>
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}
