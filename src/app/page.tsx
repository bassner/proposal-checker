"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { FileDropzone } from "@/components/file-dropzone";
import { ProviderSelect } from "@/components/provider-select";
import { Button } from "@/components/ui/button";
import { useReview } from "@/hooks/use-review";
import { UserMenu } from "@/components/auth/user-menu";
import type { ProviderType, ModelConfig } from "@/types/review";
import {
  GraduationCap,
  Play,
  Loader2,
  LogIn,
  FileText,
  Sparkles,
  CheckCircle,
  ShieldX,
} from "lucide-react";

/**
 * Root page. Shows the sign-in landing for unauthenticated users,
 * an unauthorized message for users without a role, or the upload UI.
 */
export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <SignInLanding />;
  }

  if (!session?.user?.role) {
    return <Unauthorized />;
  }

  return <UploadPage />;
}

// ── Sign-in landing (unauthenticated) ─────────────────────────────────────

function SignInLanding() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-400/5 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-md flex-col items-center px-6 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20 backdrop-blur-sm">
          <GraduationCap className="h-8 w-8 text-blue-400" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-white">Proposal Checker</h1>
        <p className="mt-2 text-center text-sm text-white/40">
          AI-powered thesis proposal review for the research group
        </p>

        <div className="mt-8 w-full space-y-3">
          <FeatureRow icon={<FileText className="h-4 w-4" />} text="Upload your thesis proposal as PDF" />
          <FeatureRow icon={<Sparkles className="h-4 w-4" />} text="7 parallel AI checks against academic guidelines" />
          <FeatureRow icon={<CheckCircle className="h-4 w-4" />} text="Actionable feedback streamed in real-time" />
        </div>

        <button
          onClick={() => signIn("keycloak", { redirectTo: "/" })}
          className="mt-10 flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <LogIn className="h-4 w-4" />
          Sign in with TUM ID
        </button>

        <footer className="mt-12 text-center text-xs text-white/20">
          Created with ❤️ by{" "}
          <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-white/30 transition-colors hover:text-white/50">
            @bassner
          </a>
        </footer>
      </div>
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-4 py-3">
      <span className="text-blue-400/70">{icon}</span>
      <span className="text-sm text-white/50">{text}</span>
    </div>
  );
}

// ── Unauthorized (authenticated but no role) ──────────────────────────────

function Unauthorized() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-red-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-red-500/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md px-6">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 backdrop-blur-xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/20">
              <ShieldX className="h-6 w-6 text-red-400" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-white">Access Denied</h1>
            <p className="mt-2 text-sm text-white/40">
              You are not authorized to use this application.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upload page (authenticated) ───────────────────────────────────────────

function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [provider, setProviderRaw] = useState<ProviderType>("azure");
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const setProvider = useCallback((v: ProviderType) => {
    setProviderRaw(v);
    localStorage.setItem("proposal-checker:provider", v);
  }, []);
  const { startReview, error, isUploading } = useReview();

  useEffect(() => {
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
  }, []);

  const handleStart = async () => {
    if (!file) return;
    const id = await startReview(file, provider);
    if (id) {
      router.push(`/review/${id}`);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto min-h-screen w-full max-w-[960px] px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <GraduationCap className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Proposal Checker</h1>
              <p className="text-xs text-white/40">AI-powered thesis proposal review</p>
            </div>
          </div>
          <UserMenu />
        </div>

        <div className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <FileDropzone
            onFileSelect={setFile}
            selectedFile={file}
            onClear={() => setFile(null)}
            disabled={isUploading}
          />

          {modelsLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-white/40" />
              <span className="text-sm text-white/40">Loading providers...</span>
            </div>
          ) : models.length === 0 ? (
            <p className="text-sm text-amber-400">
              No models available for your role — contact an admin.
            </p>
          ) : (
            <ProviderSelect
              value={provider}
              onChange={setProvider}
              disabled={isUploading}
              models={models}
            />
          )}

          <Button
            onClick={handleStart}
            disabled={!file || isUploading || models.length === 0}
            className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Review
              </>
            )}
          </Button>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <footer className="mt-12 pb-4 text-center text-xs text-white/20">
          Created with ❤️ by{" "}
          <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-white/30 transition-colors hover:text-white/50">
            @bassner
          </a>
        </footer>
      </div>
    </div>
  );
}
