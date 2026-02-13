"use client";

import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  AlertTriangle,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import type { SupervisorOverview } from "@/lib/db";

function useAnimatedCounter(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    startTime.current = null;
    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate);
      }
    };
    rafId.current = requestAnimationFrame(animate);
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [target, duration]);

  return value;
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  accentClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtitle?: string;
  accentClass: string;
}) {
  const animatedValue = useAnimatedCounter(value);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentClass}`}
        >
          {icon}
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-white/50">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">
        {animatedValue}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs text-slate-400 dark:text-white/30">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function OverviewCards({ data }: { data: SupervisorOverview }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={
          <ClipboardList className="h-4 w-4 text-blue-500 dark:text-blue-400" />
        }
        label="Total Reviews"
        value={data.totalReviews}
        accentClass="bg-blue-50 dark:bg-blue-500/20"
      />
      <StatCard
        icon={
          <BarChart3 className="h-4 w-4 text-violet-500 dark:text-violet-400" />
        }
        label="Avg Findings / Review"
        value={data.avgFindingsPerReview}
        subtitle="Across completed reviews"
        accentClass="bg-violet-50 dark:bg-violet-500/20"
      />
      <StatCard
        icon={
          <TrendingUp className="h-4 w-4 text-amber-500 dark:text-amber-400" />
        }
        label="Most Common Severity"
        value={
          data.severityDistribution.length > 0
            ? data.severityDistribution[0].count
            : 0
        }
        subtitle={data.mostCommonSeverity ?? "N/A"}
        accentClass="bg-amber-50 dark:bg-amber-500/20"
      />
      <StatCard
        icon={
          <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
        }
        label="Needs Attention"
        value={data.reviewsNeedingAttention}
        subtitle="Reviews with unresolved critical findings"
        accentClass="bg-red-50 dark:bg-red-500/20"
      />
    </div>
  );
}
