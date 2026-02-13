"use client";

import { useSession, signIn } from "next-auth/react";
import { LogOut, Shield, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export function UserMenu() {
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

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <Link
        href="/reviews"
        aria-label="My Reviews"
        className="flex items-center justify-center size-10 rounded-lg border border-white/10 bg-white/5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white md:size-auto md:gap-1.5 md:px-3 md:py-1.5"
      >
        <ClipboardList className="h-3.5 w-3.5" />
        <span className="hidden md:inline">My Reviews</span>
      </Link>
      {isAdmin && (
        <Link
          href="/admin"
          aria-label="Admin"
          className="flex items-center justify-center size-10 rounded-lg border border-white/10 bg-white/5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white md:size-auto md:gap-1.5 md:px-3 md:py-1.5"
        >
          <Shield className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Admin</span>
        </Link>
      )}
      <div className="flex items-center gap-2">
        <div className="hidden text-right md:block">
          <p className="text-xs font-medium text-white/70">{name || email}</p>
          <p className="text-[10px] text-white/30">{role}</p>
        </div>
        {/* Full-page navigation to API route — not a client-side route, so Link is inappropriate */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/auth/federated-signout"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white md:h-8 md:w-8"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
