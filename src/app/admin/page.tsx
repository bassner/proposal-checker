import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAllSessions } from "@/lib/sessions";
import { getAllowedProviders, APP_ROLES, ROLE_HIERARCHY } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import { Shield, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function AdminPage() {
  const session = await auth();
  if (
    !session?.user?.role ||
    ROLE_HIERARCHY[session.user.role] < ROLE_HIERARCHY["admin"]
  ) {
    redirect("/");
  }

  const sessions = getAllSessions().map((s) => ({
    id: s.id,
    status: s.status,
    userId: s.userId,
    userEmail: s.userEmail,
    userName: s.userName,
    provider: s.provider,
    createdAt: s.createdAt,
  }));

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
              <p className="text-xs text-white/40">Review sessions & role configuration</p>
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

        {/* Recent Sessions */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-white/60">Recent Review Sessions</h2>
            <p className="text-[10px] text-white/30">
              In-memory store — completed sessions expire after 10min, all data lost on restart
            </p>
          </div>
          {sessions.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/30">No active sessions</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="pb-2 pr-4 text-xs font-medium text-white/40">Session ID</th>
                    <th className="pb-2 pr-4 text-xs font-medium text-white/40">User</th>
                    <th className="pb-2 pr-4 text-xs font-medium text-white/40">Provider</th>
                    <th className="pb-2 pr-4 text-xs font-medium text-white/40">Status</th>
                    <th className="pb-2 text-xs font-medium text-white/40">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-white/5">
                      <td className="py-2 pr-4 font-mono text-xs text-white/50">
                        {s.id.slice(0, 8)}...
                      </td>
                      <td className="py-2 pr-4 text-white/70">
                        {s.userName || s.userEmail || s.userId}
                      </td>
                      <td className="py-2 pr-4 text-white/50">{s.provider}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            s.status === "done"
                              ? "bg-green-500/20 text-green-400"
                              : s.status === "error"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-white/40">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
