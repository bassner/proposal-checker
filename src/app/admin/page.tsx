import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAllowedProviders, APP_ROLES, ROLE_HIERARCHY } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import { Shield, ArrowLeft, ClipboardList } from "lucide-react";
import Link from "next/link";

export default async function AdminPage() {
  const session = await auth();
  if (
    !session?.user?.role ||
    ROLE_HIERARCHY[session.user.role] < ROLE_HIERARCHY["admin"]
  ) {
    redirect("/");
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <Shield className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Admin Panel</h1>
              <p className="text-xs text-white/40">Role configuration</p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
        </div>

        {/* Role-Provider Mapping */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <h2 className="mb-4 text-sm font-medium text-white/60">Role-Provider Mapping</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-2 pr-6 text-xs font-medium text-white/40">Role</th>
                  <th className="pb-2 text-xs font-medium text-white/40">Allowed Providers</th>
                </tr>
              </thead>
              <tbody>
                {APP_ROLES.map((role: AppRole) => (
                  <tr key={role} className="border-b border-white/5">
                    <td className="py-2 pr-6 font-medium text-white/70">{role}</td>
                    <td className="py-2 text-white/50">
                      {getAllowedProviders(role).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reviews link */}
        <Link
          href="/reviews"
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-5 text-white/60 backdrop-blur-xl transition-colors hover:bg-white/10 hover:text-white"
        >
          <ClipboardList className="h-5 w-5" />
          <span className="text-sm font-medium">View all reviews &rarr;</span>
        </Link>
      </div>
    </div>
  );
}
