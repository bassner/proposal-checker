import { loadAllGuidelines } from "@/lib/guidelines/loader";
import { GuidelinesViewer } from "./guidelines-viewer";
import { GraduationCap, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Guidelines - Proposal Checker",
};

export default async function GuidelinesPage() {
  const guidelines = await loadAllGuidelines();

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto min-h-screen w-full max-w-[960px] px-3 py-4 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <GraduationCap className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Guidelines</h1>
              <p className="text-xs text-white/40">What your proposal will be checked against</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
        </div>

        <GuidelinesViewer guidelines={guidelines} />

        <footer className="mt-12 pb-4 text-center text-xs text-white/20">
          Created with &#10084;&#65039; by{" "}
          <a href="https://github.com/bassner" target="_blank" rel="noopener noreferrer" className="text-white/30 transition-colors hover:text-white/50">
            @bassner
          </a>
        </footer>
      </div>
    </div>
  );
}
