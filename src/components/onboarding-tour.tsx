"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Upload,
  Cpu,
  FileText,
  Settings2,
  Play,
  ChevronLeft,
  ChevronRight,
  X,
  PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnboardingState } from "@/hooks/use-onboarding";

interface TourStep {
  selector: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="upload-zone"]',
    title: "Upload Your Proposal",
    description:
      "Drag and drop your thesis proposal PDF here, or click to browse your files. You can also upload multiple files at once for batch review.",
    icon: <Upload className="h-4 w-4" />,
  },
  {
    selector: '[data-tour="review-mode"]',
    title: "Choose Review Mode",
    description:
      "Select whether you are reviewing a short proposal (4-6 pages) or a full thesis document. Each mode runs a different set of checks.",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    selector: '[data-tour="provider-select"]',
    title: "Select LLM Provider",
    description:
      "Pick the AI model that will analyze your document. Different providers offer different levels of depth and speed.",
    icon: <Cpu className="h-4 w-4" />,
  },
  {
    selector: '[data-tour="check-groups"]',
    title: "Customize Check Groups",
    description:
      "Expand this section to enable or disable individual check categories. You can focus on specific areas like structure, writing quality, or bibliography.",
    icon: <Settings2 className="h-4 w-4" />,
  },
  {
    selector: '[data-tour="submit-button"]',
    title: "Start Your Review",
    description:
      "Once your PDF is uploaded and settings configured, hit this button to kick off the AI-powered review. Results stream back in real-time.",
    icon: <Play className="h-4 w-4" />,
  },
];

type TooltipPosition = "top" | "bottom";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour({ tour }: { tour: OnboardingState }) {
  const { isActive, currentStep, nextStep, prevStep, skipTour, totalSteps } = tour;
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>("bottom");
  const [showCompletion, setShowCompletion] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Measure the target element and compute tooltip position
  const measureTarget = useCallback(() => {
    if (!isActive || currentStep < 0 || currentStep >= TOUR_STEPS.length) {
      setTargetRect(null);
      return;
    }

    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.selector);
    if (!el) {
      setTargetRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = 8;
    setTargetRect({
      top: rect.top - padding + window.scrollY,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });

    // Position tooltip above or below depending on space
    const spaceBelow = window.innerHeight - rect.bottom;
    setTooltipPos(spaceBelow < 280 ? "top" : "bottom");
  }, [isActive, currentStep]);

  // Re-measure on step change and on scroll/resize
  useEffect(() => {
    if (!isActive) return;

    // Small delay to let any DOM changes settle before measuring
    const timer = setTimeout(measureTarget, 100);

    const handleReposition = () => measureTarget();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isActive, currentStep, measureTarget]);

  // Scroll target into view
  useEffect(() => {
    if (!isActive || currentStep < 0 || currentStep >= TOUR_STEPS.length) return;
    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.selector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isActive, currentStep]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        skipTour();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        nextStep();
      } else if (e.key === "ArrowLeft") {
        prevStep();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isActive, skipTour, nextStep, prevStep]);

  // Intercept completion: show confetti-like state before fully closing
  const handleNext = useCallback(() => {
    if (currentStep >= totalSteps - 1) {
      setShowCompletion(true);
      setTimeout(() => {
        setShowCompletion(false);
        nextStep();
      }, 1800);
    } else {
      nextStep();
    }
  }, [currentStep, totalSteps, nextStep]);

  if (!isActive && !showCompletion) return null;

  // Completion screen
  if (showCompletion) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        {/* Completion card */}
        <div className="relative animate-in fade-in zoom-in-95 duration-300 rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/20">
              <PartyPopper className="h-7 w-7 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
              You&apos;re all set!
            </h3>
            <p className="mt-2 max-w-xs text-sm text-slate-500 dark:text-white/50">
              You now know the essentials. Upload a proposal and start your first review.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const step = TOUR_STEPS[currentStep];
  if (!step) return null;

  return (
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-label="Onboarding tour">
      {/* SVG overlay with cutout around target */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ zIndex: 1 }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-spotlight-mask)"
          className="pointer-events-auto cursor-pointer"
          onClick={skipTour}
        />
      </svg>

      {/* Spotlight ring around target */}
      {targetRect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-blue-400/80 ring-offset-2 ring-offset-transparent transition-all duration-300"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            zIndex: 2,
          }}
        />
      )}

      {/* Tooltip card */}
      {targetRect && (
        <div
          ref={tooltipRef}
          className="absolute z-[3] w-[340px] animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{
            ...(tooltipPos === "bottom"
              ? { top: targetRect.top + targetRect.height + 16 }
              : { top: targetRect.top - 16, transform: "translateY(-100%)" }),
            left: Math.max(
              16,
              Math.min(
                targetRect.left + targetRect.width / 2 - 170,
                window.innerWidth - 356
              )
            ),
          }}
        >
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-slate-900 dark:shadow-2xl">
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                  {step.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-white/30">
                    Step {currentStep + 1} of {totalSteps}
                  </p>
                </div>
              </div>
              <button
                onClick={skipTour}
                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-white/30 dark:hover:bg-white/10 dark:hover:text-white/60"
                aria-label="Close tour"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Description */}
            <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-white/60">
              {step.description}
            </p>

            {/* Progress dots + nav buttons */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === currentStep
                        ? "w-4 bg-blue-500"
                        : i < currentStep
                          ? "w-1.5 bg-blue-300 dark:bg-blue-500/50"
                          : "w-1.5 bg-slate-200 dark:bg-white/10"
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={skipTour}
                  className="text-xs text-slate-400 transition-colors hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
                >
                  Skip
                </button>
                {currentStep > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={prevStep}
                    className="h-8 px-2 text-xs text-slate-600 dark:text-white/60"
                  >
                    <ChevronLeft className="mr-1 h-3 w-3" />
                    Back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="h-8 bg-blue-600 px-3 text-xs text-white hover:bg-blue-500"
                >
                  {currentStep >= totalSteps - 1 ? (
                    "Finish"
                  ) : (
                    <>
                      Next
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
