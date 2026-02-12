"use client";

import { signIn } from "next-auth/react";
import { GraduationCap, LogIn, FileText, Sparkles, CheckCircle } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-400/5 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-md flex-col items-center px-6 py-12">
        {/* Icon + title */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20 backdrop-blur-sm">
          <GraduationCap className="h-8 w-8 text-blue-400" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-white">Proposal Checker</h1>
        <p className="mt-2 text-center text-sm text-white/40">
          AI-powered thesis proposal review for the research group
        </p>

        {/* Feature highlights */}
        <div className="mt-8 w-full space-y-3">
          <FeatureRow icon={<FileText className="h-4 w-4" />} text="Upload your thesis proposal as PDF" />
          <FeatureRow icon={<Sparkles className="h-4 w-4" />} text="7 parallel AI checks against academic guidelines" />
          <FeatureRow icon={<CheckCircle className="h-4 w-4" />} text="Actionable feedback streamed in real-time" />
        </div>

        {/* Sign-in button */}
        <button
          onClick={() => signIn("keycloak", { redirectTo: "/" })}
          className="mt-10 flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <LogIn className="h-4 w-4" />
          Sign in with TUM ID
        </button>

        <footer className="mt-12 text-center text-xs text-white/20">
          Created with ❤️ by{" "}
          <a
            href="https://github.com/bassner"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/30 transition-colors hover:text-white/50"
          >
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
