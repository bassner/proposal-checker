"use client";

import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "proposal-checker:onboarding-completed";

export interface OnboardingState {
  /** Whether the user has completed or skipped the tour previously */
  hasSeenTour: boolean;
  /** Currently active step index (0-based), -1 if tour inactive */
  currentStep: number;
  /** Whether the tour is currently running */
  isActive: boolean;
  /** Start the tour from the beginning */
  startTour: () => void;
  /** Advance to the next step; completes tour if on last step */
  nextStep: () => void;
  /** Go back to the previous step */
  prevStep: () => void;
  /** Skip / dismiss the tour and mark as seen */
  skipTour: () => void;
  /** Reset localStorage so the tour triggers again on next visit */
  resetTour: () => void;
  /** Total number of steps */
  totalSteps: number;
}

const TOTAL_STEPS = 5;

function getStoredSeen(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function useOnboarding(): OnboardingState {
  const [hasSeenTour, setHasSeenTour] = useState(getStoredSeen);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isActive, setIsActive] = useState(false);
  const autoStarted = useRef(false);

  // Auto-start tour for first-time users after a short delay
  useEffect(() => {
    if (hasSeenTour || autoStarted.current) return;
    autoStarted.current = true;
    // Small delay to let page elements render and become measurable
    const timer = setTimeout(() => {
      setIsActive(true);
      setCurrentStep(0);
    }, 600);
    return () => clearTimeout(timer);
  }, [hasSeenTour]);

  const markSeen = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setHasSeenTour(true);
  }, []);

  const startTour = useCallback(() => {
    setIsActive(true);
    setCurrentStep(0);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= TOTAL_STEPS - 1) {
        // Completed the last step
        setIsActive(false);
        markSeen();
        return -1;
      }
      return prev + 1;
    });
  }, [markSeen]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(-1);
    markSeen();
  }, [markSeen]);

  const resetTour = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHasSeenTour(false);
    autoStarted.current = false;
  }, []);

  return {
    hasSeenTour,
    currentStep,
    isActive,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    resetTour,
    totalSteps: TOTAL_STEPS,
  };
}
