import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ROLE_HIERARCHY } from "@/lib/auth/roles";
import { getSupervisorOverview, getReviewsByUser } from "@/lib/db";
import { Users, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { OverviewCards } from "@/components/supervisor/overview-cards";
import { StudentList } from "@/components/supervisor/student-list";

export default async function SupervisorPage() {
  const session = await auth();
  if (
    !session?.user?.role ||
    ROLE_HIERARCHY[session.user.role] < ROLE_HIERARCHY["phd"]
  ) {
    redirect("/");
  }

  // PhD users see only their students' reviews; admins see global view
  const isAdmin = session.user.role === "admin";
  const supervisorId = isAdmin ? undefined : session.user.id;

  const [overview, studentGroups] = await Promise.all([
    getSupervisorOverview(supervisorId).catch((err) => {
      console.error("[supervisor] Failed to load overview:", err);
      return null;
    }),
    getReviewsByUser(supervisorId).catch((err) => {
      console.error("[supervisor] Failed to load student groups:", err);
      return [];
    }),
  ]);

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/5 blur-3xl dark:bg-purple-500/10" />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 backdrop-blur-sm dark:bg-indigo-500/20">
              <Users className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                Supervisor Dashboard
              </h1>
              <p className="text-xs text-slate-500 dark:text-white/40">
                {isAdmin ? "Aggregated review overview across all students" : "Reviews for your assigned students"}
              </p>
            </div>
          </div>
          <nav aria-label="Page navigation">
            <Link
              href="/"
              aria-label="Back to Home"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
          </nav>
        </header>

        <main id="main-content">
          {/* Overview Cards */}
          {overview ? (
            <div className="mb-8">
              <OverviewCards data={overview} />
            </div>
          ) : (
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
              Could not load overview statistics. The database may be unavailable.
            </div>
          )}

          {/* Severity Distribution */}
          {overview && overview.severityDistribution.length > 0 && (
            <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-xl">
              <h2 className="mb-4 text-sm font-medium text-slate-500 dark:text-white/60">
                Severity Distribution
              </h2>
              <div className="flex flex-wrap gap-3">
                {overview.severityDistribution.map((s) => {
                  const colors: Record<string, string> = {
                    critical: "bg-red-500",
                    major: "bg-orange-500",
                    minor: "bg-amber-500",
                    suggestion: "bg-blue-500",
                  };
                  const bgColor = colors[s.severity] ?? "bg-slate-500";
                  const totalFindings = overview.severityDistribution.reduce(
                    (sum, x) => sum + x.count,
                    0
                  );
                  const pct =
                    totalFindings > 0
                      ? Math.round((s.count / totalFindings) * 100)
                      : 0;
                  return (
                    <div key={s.severity} className="flex-1 min-w-[120px]">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-medium capitalize text-slate-700 dark:text-white/70">
                          {s.severity}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-white/40">
                          {s.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                        <div
                          className={`h-full rounded-full ${bgColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Student-grouped reviews */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-xl">
            <h2 className="mb-4 text-sm font-medium text-slate-500 dark:text-white/60">
              Reviews by Student ({studentGroups.length} student
              {studentGroups.length !== 1 ? "s" : ""})
            </h2>
            <StudentList groups={studentGroups} />
          </div>
        </main>
      </div>
    </div>
  );
}
