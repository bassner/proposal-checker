"use client";

import { useSession, signIn } from "next-auth/react";
import { LogOut, Shield, ClipboardList, Users, HelpCircle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { NotificationBell } from "./notification-bell";


interface UserMenuProps {
  /** When provided, shows a "Replay Tour" button that triggers the onboarding walkthrough */
  onReplayTour?: () => void;
}

export function UserMenu({ onReplayTour }: UserMenuProps = {}) {
  const { data: session } = useSession();

  // If the token refresh failed, force re-login (with loop guard)
  useEffect(() => {
    const key = "proposal-checker:refresh-retry";
    if (session?.error === "RefreshTokenError") {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        signIn("keycloak");
      }
    } else if (session && !session.error) {
      // Successful session — clear the retry flag
      sessionStorage.removeItem(key);
    }
  }, [session?.error, session]);

  if (!session?.user) return null;

  const { name, email, role } = session.user;
  const isAdmin = role === "admin";
  const isSupervisor = role === "admin" || role === "phd";

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <Link
        href="/reviews?mine=true"
        aria-label="My Reviews"
        className="flex items-center justify-center size-10 shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white md:size-auto md:gap-1.5 md:px-3 md:py-1.5"
      >
        <ClipboardList className="h-3.5 w-3.5" />
        <span className="hidden md:inline">My&nbsp;Reviews</span>
      </Link>
      {isSupervisor && (
        <Link
          href="/supervisor"
          aria-label="Supervisor Dashboard"
          className="flex items-center justify-center size-10 rounded-lg border border-slate-200 bg-white text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white md:size-auto md:gap-1.5 md:px-3 md:py-1.5"
        >
          <Users className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Supervisor</span>
        </Link>
      )}
      {isAdmin && (
        <Link
          href="/admin"
          aria-label="Admin"
          className="flex items-center justify-center size-10 rounded-lg border border-slate-200 bg-white text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white md:size-auto md:gap-1.5 md:px-3 md:py-1.5"
        >
          <Shield className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Admin</span>
        </Link>
      )}
      {onReplayTour && (
        <button
          onClick={onReplayTour}
          className="flex items-center justify-center size-10 rounded-lg border border-slate-200 bg-white text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white md:size-auto md:gap-1.5 md:px-3 md:py-1.5"
          aria-label="Replay Tour"
          title="Replay onboarding tour"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Tour</span>
        </button>
      )}
      <NotificationBell />
      <div className="flex items-center gap-2">
        <div className="hidden text-right md:block">
          <p className="text-xs font-medium text-slate-700 dark:text-white/70">{name || email}</p>
          <p className="text-[10px] text-slate-400 dark:text-white/30">{role}</p>
        </div>
        {/* Full-page navigation to API route — not a client-side route, so Link is inappropriate */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/auth/federated-signout"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white md:h-8 md:w-8"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
