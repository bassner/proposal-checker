"use client";

import { GraduationCap, LogIn } from "lucide-react";

export default function SignedOutPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>
      <div className="relative flex flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20 backdrop-blur-sm">
          <GraduationCap className="h-8 w-8 text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">Signed out</h1>
          <p className="mt-1 text-sm text-white/40">You have been successfully signed out.</p>
        </div>
        <a
          href="/"
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogIn className="h-4 w-4" />
          Sign in again
        </a>
      </div>
    </div>
  );
}
