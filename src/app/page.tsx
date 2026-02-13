"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { FileDropzone } from "@/components/file-dropzone";
import { BatchFileList } from "@/components/batch-file-list";
import { ProviderSelect } from "@/components/provider-select";
import { Button } from "@/components/ui/button";
import { useReview } from "@/hooks/use-review";
import { useBatchReview } from "@/hooks/use-batch-review";
import { UserMenu } from "@/components/auth/user-menu";
import type { ProviderType, ReviewMode, ModelConfig, CheckGroupId } from "@/types/review";
import { REVIEW_MODES, getCheckGroups } from "@/types/review";

interface ReviewTemplate {
  id: string;
  name: string;
  description: string;
  checkGroups: CheckGroupId[];
  reviewMode: ReviewMode;
}
import Link from "next/link";
import {
  GraduationCap,
  Play,
  Loader2,
  LogIn,
  FileText,
  Sparkles,
  CheckCircle,
  ShieldX,
  BookOpen,
  ChevronDown,
  Settings2,
  Layers,
  FileStack,
} from "lucide-react";
import { PreflightWarnings } from "@/components/preflight-warnings";
import { OnboardingTour } from "@/components/onboarding-tour";
import { useOnboarding } from "@/hooks/use-onboarding";
import type { PreflightWarning } from "@/lib/pdf/preflight";

/**
 * Root page. Shows the sign-in landing for unauthenticated users,
 * an unauthorized message for users without a role, or the upload UI.
 */
export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300 dark:text-white/30" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <SignInLanding />;
  }

  if (!session?.user?.role) {
    return <Unauthorized />;
  }

  return <UploadPage key="upload" />;
}

// ── Sign-in landing (unauthenticated) ─────────────────────────────────────

function SignInLanding() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-purple-500/5 blur-3xl dark:bg-purple-500/10" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-400/5 blur-3xl" />
      </div>

      <main id="main-content" className="relative flex w-full max-w-md flex-col items-center px-6 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 backdrop-blur-sm dark:bg-blue-500/20">
          <GraduationCap className="h-8 w-8 text-blue-500 dark:text-blue-400" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900 dark:text-white">Proposal Checker</h1>
        <p className="mt-2 text-center text-sm text-slate-500 dark:text-white/40">
          Research Group for Applied Education Technologies
        </p>

        <div className="mt-8 w-full space-y-3">
          <FeatureRow icon={<FileText className="h-4 w-4" />} text="Upload your thesis proposal as PDF" />
          <FeatureRow icon={<Sparkles className="h-4 w-4" />} text="Parallel AI checks against academic guidelines" />
          <FeatureRow icon={<CheckCircle className="h-4 w-4" />} text="Actionable feedback streamed in real-time" />
        </div>

        <button
          onClick={() => signIn("keycloak", { redirectTo: "/" })}
          className="mt-10 flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <LogIn className="h-4 w-4" />
          Sign in with TUM ID
        </button>

        <Link
          href="/guidelines"
          className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400 transition-colors hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60"
        >
          <BookOpen className="h-3.5 w-3.5" />
          View proposal guidelines
        </Link>

        <footer className="mt-12 text-center text-xs text-slate-300 dark:text-white/20" role="contentinfo">
          Created with ❤️ by{" "}
          <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-slate-400 transition-colors hover:text-slate-600 dark:text-white/30 dark:hover:text-white/50">
            @bassner
          </a>
        </footer>
      </main>
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-white/5 dark:bg-white/[0.03]">
      <span className="text-blue-500/70 dark:text-blue-400/70">{icon}</span>
      <span className="text-sm text-slate-600 dark:text-white/50">{text}</span>
    </div>
  );
}

// ── Unauthorized (authenticated but no role) ──────────────────────────────

function Unauthorized() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-red-500/5 blur-3xl dark:bg-red-500/10" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-red-500/5 blur-3xl" />
      </div>

      <main id="main-content" className="relative w-full max-w-md px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 backdrop-blur-xl dark:border-red-500/20 dark:bg-red-500/5" role="alert">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 dark:bg-red-500/20">
              <ShieldX className="h-6 w-6 text-red-500 dark:text-red-400" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">Access Denied</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-white/40">
              You are not authorized to use this application.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Upload page (authenticated) ───────────────────────────────────────────

const MODE_LABELS: Record<ReviewMode, string> = {
  proposal: "Proposal",
  thesis: "Thesis",
};

const MODE_DESCRIPTIONS: Record<ReviewMode, string> = {
  proposal: "4-6 page thesis proposal (9 checks)",
  thesis: "Full thesis document (12 checks)",
};

const STORAGE_KEY_GROUPS = "proposal-checker:selectedGroups";

function UploadPage() {
  const router = useRouter();
  const tour = useOnboarding();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setModeRaw] = useState<ReviewMode>("proposal");
  const [provider, setProviderRaw] = useState<ProviderType>("azure");
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<Set<CheckGroupId>>(() => new Set());
  const [groupsInitialized, setGroupsInitialized] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [templates, setTemplates] = useState<ReviewTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [preflightWarnings, setPreflightWarnings] = useState<PreflightWarning[]>([]);
  const [preflightPageCount, setPreflightPageCount] = useState<number>(0);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightDismissed, setPreflightDismissed] = useState(false);
  const setMode = useCallback((v: ReviewMode) => {
    setModeRaw(v);
    localStorage.setItem("proposal-checker:mode", v);
    // Reset to all groups for the new mode
    const allIds = new Set(getCheckGroups(v).map((g) => g.id));
    setSelectedGroups(allIds);
    localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify([...allIds]));
    setSelectedTemplate(null);
  }, []);
  const setProvider = useCallback((v: ProviderType) => {
    setProviderRaw(v);
    localStorage.setItem("proposal-checker:provider", v);
  }, []);
  const { startReview, error, isUploading } = useReview();
  const batch = useBatchReview();
  const isBatchMode = batch.files.length > 0;
  const isAnySubmitting = isUploading || batch.isSubmitting;

  // Derived values for current mode
  const modeGroups = getCheckGroups(mode);
  const modeGroupIds = modeGroups.map((g) => g.id);
  const allSelected = groupsInitialized && selectedGroups.size === modeGroupIds.length;
  const noneSelected = groupsInitialized && selectedGroups.size === 0;

  const toggleGroup = useCallback((groupId: CheckGroupId) => {
    setSelectedTemplate(null);
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedTemplate(null);
    setSelectedGroups((prev) => {
      const allIds = getCheckGroups(mode).map((g) => g.id);
      const next = prev.size === allIds.length
        ? new Set<CheckGroupId>()
        : new Set(allIds);
      localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify([...next]));
      return next;
    });
  }, [mode]);

  const applyTemplate = useCallback((template: ReviewTemplate) => {
    setSelectedTemplate(template.id);
    setModeRaw(template.reviewMode);
    localStorage.setItem("proposal-checker:mode", template.reviewMode);
    const groups = new Set<CheckGroupId>(template.checkGroups);
    setSelectedGroups(groups);
    localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify([...groups]));
  }, []);

  useEffect(() => {
    // Restore saved mode + selectedGroups
    const savedMode = localStorage.getItem("proposal-checker:mode");
    const resolvedMode: ReviewMode = savedMode && (REVIEW_MODES as readonly string[]).includes(savedMode)
      ? (savedMode as ReviewMode) : "proposal";
    setModeRaw(resolvedMode);

    const allIds = getCheckGroups(resolvedMode).map((g) => g.id);
    try {
      const saved = localStorage.getItem(STORAGE_KEY_GROUPS);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed)) {
          const validSet = new Set(allIds);
          const restored = parsed.filter((id) => validSet.has(id as CheckGroupId)) as CheckGroupId[];
          if (restored.length > 0) {
            setSelectedGroups(new Set(restored));
            setGroupsInitialized(true);
          } else {
            setSelectedGroups(new Set(allIds));
            setGroupsInitialized(true);
          }
        } else {
          setSelectedGroups(new Set(allIds));
          setGroupsInitialized(true);
        }
      } else {
        setSelectedGroups(new Set(allIds));
        setGroupsInitialized(true);
      }
    } catch {
      setSelectedGroups(new Set(allIds));
      setGroupsInitialized(true);
    }

    async function fetchModels() {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) return;
        const data = await res.json();
        const fetched: ModelConfig[] = data.models ?? [];
        setModels(fetched);

        const saved = localStorage.getItem("proposal-checker:provider");
        const providerIds = fetched.map((m: ModelConfig) => m.provider);
        if (saved && providerIds.includes(saved as ProviderType)) {
          setProviderRaw(saved as ProviderType);
        } else if (fetched.length > 0) {
          setProviderRaw(fetched[0].provider);
          localStorage.setItem("proposal-checker:provider", fetched[0].provider);
        }
      } finally {
        setModelsLoading(false);
      }
    }
    fetchModels();

    async function fetchTemplates() {
      try {
        const res = await fetch("/api/review-templates");
        if (!res.ok) return;
        const data = await res.json();
        setTemplates(data.templates ?? []);
      } catch {
        // Templates are optional — silently ignore
      }
    }
    fetchTemplates();
  }, []);

  // Run preflight analysis when a file is selected (single-file mode only)
  useEffect(() => {
    if (!file) {
      setPreflightWarnings([]);
      setPreflightPageCount(0);
      setPreflightDismissed(false);
      return;
    }

    let cancelled = false;
    async function analyze() {
      setPreflightLoading(true);
      setPreflightDismissed(false);
      setPreflightWarnings([]);
      try {
        const formData = new FormData();
        formData.append("file", file!);
        const res = await fetch("/api/preflight", { method: "POST", body: formData });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setPreflightWarnings(data.warnings ?? []);
          setPreflightPageCount(data.pageCount ?? 0);
        }
      } catch {
        // Preflight is best-effort — don't block the user on failure
      } finally {
        if (!cancelled) setPreflightLoading(false);
      }
    }
    analyze();
    return () => { cancelled = true; };
  }, [file]);

  const handleMultiFileSelect = useCallback((files: File[]) => {
    // Switch to batch mode — clear any single file selection
    setFile(null);
    batch.addFiles(files);
  }, [batch]);

  const handleStart = async () => {
    if (isBatchMode) {
      // Batch mode: submit all queued files sequentially
      if (batch.files.length === 0 || noneSelected) return;
      const groupsToSend = allSelected ? undefined : [...selectedGroups];
      const { successCount } = await batch.submitAll(provider, mode, groupsToSend);
      if (successCount > 0) {
        router.push("/reviews");
      }
    } else {
      // Single-file mode (unchanged)
      if (!file || noneSelected) return;
      const groupsToSend = allSelected ? undefined : [...selectedGroups];
      const id = await startReview(file, provider, mode, groupsToSend);
      if (id) {
        router.push(`/review/${id}`);
      }
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/5 blur-3xl dark:bg-purple-500/10" />
      </div>

      <div className="relative mx-auto min-h-screen w-full max-w-[960px] px-3 py-4 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 backdrop-blur-sm dark:bg-blue-500/20">
              <GraduationCap className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Proposal Checker</h1>
              <p className="text-xs text-slate-500 dark:text-white/40">Research Group for Applied Education Technologies</p>
            </div>
          </div>
          <nav aria-label="User navigation">
            <UserMenu onReplayTour={tour.startTour} />
          </nav>
        </header>

        <main id="main-content" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-xl sm:p-5">
          <div data-tour="upload-zone">
          {isBatchMode ? (
            <>
              <BatchFileList
                files={batch.files}
                onRemove={batch.removeFile}
                onClear={() => batch.clearFiles()}
                disabled={batch.isSubmitting}
              />
              {!batch.isSubmitting && (
                <FileDropzone
                  onFileSelect={(f) => batch.addFiles([f])}
                  onMultiFileSelect={(files) => batch.addFiles(files)}
                  selectedFile={null}
                  onClear={() => {}}
                  disabled={batch.isSubmitting}
                />
              )}
            </>
          ) : (
            <FileDropzone
              onFileSelect={setFile}
              onMultiFileSelect={handleMultiFileSelect}
              selectedFile={file}
              onClear={() => setFile(null)}
              disabled={isAnySubmitting}
            />
          )}
          </div>

          {/* Preflight analysis warnings (single-file mode) */}
          {!isBatchMode && file && preflightLoading && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <Loader2 className="h-4 w-4 animate-spin text-amber-500 dark:text-amber-400" />
              <span className="text-sm text-slate-500 dark:text-white/50">Analyzing document structure...</span>
            </div>
          )}
          {!isBatchMode && file && !preflightLoading && preflightWarnings.length > 0 && !preflightDismissed && (
            <PreflightWarnings
              warnings={preflightWarnings}
              pageCount={preflightPageCount}
              onReviewAnyway={() => setPreflightDismissed(true)}
              onReUpload={() => setFile(null)}
              disabled={isAnySubmitting}
            />
          )}

          {/* Review mode selector */}
          <div data-tour="review-mode">
            <label className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/50">Review Mode</label>
            <div className="flex gap-2">
              {REVIEW_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={isAnySubmitting}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    mode === m
                      ? "border-blue-500/50 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50 dark:hover:border-white/20 dark:hover:text-white/70"
                  } disabled:opacity-40`}
                >
                  <div>{MODE_LABELS[m]}</div>
                  <div className="mt-0.5 text-[10px] font-normal opacity-60">{MODE_DESCRIPTIONS[m]}</div>
                </button>
              ))}
            </div>
          </div>

          <div data-tour="provider-select">
          {modelsLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-white/40" />
              <span className="text-sm text-slate-400 dark:text-white/40">Loading providers...</span>
            </div>
          ) : models.length === 0 ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No models available for your role — contact an admin.
            </p>
          ) : (
            <ProviderSelect
              value={provider}
              onChange={setProvider}
              disabled={isAnySubmitting}
              models={models}
            />
          )}
          </div>

          {/* Template selector */}
          {templates.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-medium text-white/50">
                <FileStack className="mr-1.5 inline h-3.5 w-3.5" />
                Template
              </label>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    disabled={isAnySubmitting}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      selectedTemplate === t.id
                        ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                        : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/70"
                    } disabled:opacity-40`}
                  >
                    <div className="font-medium">{t.name}</div>
                    {t.description && (
                      <div className="mt-0.5 text-[10px] font-normal opacity-60">{t.description}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Advanced Options — check group toggles */}
          <div data-tour="check-groups" className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/5 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setOptionsOpen((prev) => !prev)}
              disabled={isAnySubmitting}
              className="flex w-full items-center justify-between px-4 py-3 text-sm text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-40 dark:text-white/50 dark:hover:text-white/70"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5" />
                Check Groups
                {groupsInitialized && !allSelected && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                    {selectedGroups.size}/{modeGroupIds.length}
                  </span>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${optionsOpen ? "rotate-180" : ""}`} />
            </button>
            {optionsOpen && (
              <div className="border-t border-slate-200 px-4 pb-3 pt-2 dark:border-white/5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-white/30">Toggle checks to run</span>
                  <button
                    type="button"
                    onClick={toggleAll}
                    disabled={isAnySubmitting}
                    className="text-[11px] text-blue-500/70 transition-colors hover:text-blue-600 disabled:opacity-40 dark:text-blue-400/70 dark:hover:text-blue-400"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {modeGroups.map((g) => {
                    const checked = selectedGroups.has(g.id);
                    return (
                      <label
                        key={g.id}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                          checked ? "bg-slate-100 text-slate-700 dark:bg-white/[0.04] dark:text-white/70" : "text-slate-400 dark:text-white/30"
                        } ${isAnySubmitting ? "pointer-events-none opacity-40" : "hover:bg-slate-100 dark:hover:bg-white/[0.06]"}`}
                      >
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleGroup(g.id)}
                            disabled={isAnySubmitting}
                            className="peer sr-only"
                          />
                          <div className={`h-4 w-7 rounded-full transition-colors ${
                            checked ? "bg-blue-500" : "bg-slate-200 dark:bg-white/10"
                          }`} />
                          <div className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                            checked ? "translate-x-3" : "translate-x-0"
                          }`} />
                        </div>
                        <span className="truncate">{g.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <Button
            data-tour="submit-button"
            onClick={handleStart}
            disabled={
              isAnySubmitting ||
              models.length === 0 ||
              noneSelected ||
              (isBatchMode ? batch.files.length === 0 : !file)
            }
            className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {isAnySubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isBatchMode ? "Submitting..." : "Uploading..."}
              </>
            ) : isBatchMode ? (
              <>
                <Layers className="mr-2 h-4 w-4" />
                Start {batch.files.length} Review{batch.files.length !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Review
              </>
            )}
          </Button>

          {noneSelected && (
            <p className="text-sm text-amber-600 dark:text-amber-400" role="alert">Select at least one check group to start a review.</p>
          )}
          {error && <p className="text-sm text-red-500 dark:text-red-400" role="alert">{error}</p>}
        </main>

        <Link
          href="/guidelines"
          className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400 transition-colors hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60"
        >
          <BookOpen className="h-3.5 w-3.5" />
          View proposal guidelines
        </Link>

        <footer className="mt-12 pb-4 text-center text-xs text-slate-300 dark:text-white/20" role="contentinfo">
          Created with ❤️ by{" "}
          <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-slate-400 transition-colors hover:text-slate-600 dark:text-white/30 dark:hover:text-white/50">
            @bassner
          </a>
        </footer>
      </div>

      <OnboardingTour tour={tour} />
    </div>
  );
}
