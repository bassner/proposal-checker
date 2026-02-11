"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface LiveTimerProps {
  startTime: number;
  className?: string;
}

export function LiveTimer({ startTime, className }: LiveTimerProps) {
  const [elapsed, setElapsed] = useState(() =>
    ((Date.now() - startTime) / 1000).toFixed(1)
  );

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(((Date.now() - startTime) / 1000).toFixed(1));
    }, 100);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <span className={cn("tabular-nums", className)}>{elapsed}s</span>
  );
}
