"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileDropzone } from "@/components/file-dropzone";
import { ProviderSelect } from "@/components/provider-select";
import { Button } from "@/components/ui/button";
import { useReview } from "@/hooks/use-review";
import { UserMenu } from "@/components/auth/user-menu";
import type { ProviderType, ModelConfig } from "@/types/review";
import { GraduationCap, Play, Loader2 } from "lucide-react";

/**
 * Landing page. Lets the user select a PDF, choose an LLM provider, and kick
 * off a review. On success, navigates to `/review/[id]` for live progress.
 * Provider preference is persisted to localStorage.
 * Models are fetched from /api/config (filtered by role).
 */
export default function Home() {
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

        // Normalize localStorage: if saved provider isn't in allowed list, reset
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
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <GraduationCap className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">
                Proposal Checker
              </h1>
              <p className="text-xs text-white/40">
                AI-powered thesis proposal review
              </p>
            </div>
          </div>
          <UserMenu />
        </div>

        {/* Upload + Config card */}
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

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        <footer className="mt-12 pb-4 text-center text-xs text-white/20">
          Created with ❤️ by{" "}
          <a
            href="https://github.com/bassner"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/30 hover:text-white/50 transition-colors"
          >
            @bassner
          </a>
        </footer>
      </div>
    </div>
  );
}
