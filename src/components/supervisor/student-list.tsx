"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  User,
  Search,
  X,
  FileText,
  ExternalLink,
} from "lucide-react";
import type { StudentGroup } from "@/lib/db";

function statusBadge(status: string) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    done: { bg: "bg-green-500/20", text: "text-green-600 dark:text-green-400", label: "done" },
    error: { bg: "bg-red-500/20", text: "text-red-600 dark:text-red-400", label: "error" },
    running: { bg: "bg-blue-500/20", text: "text-blue-600 dark:text-blue-400", label: "running" },
  };
  const c = config[status] ?? config.running;
  return (
    <span
      className={`inline-block rounded-full ${c.bg} px-2 py-0.5 text-[10px] font-medium ${c.text}`}
    >
      {c.label}
    </span>
  );
}

function assessmentBadge(assessment: string | null) {
  if (!assessment) return null;
  const config: Record<string, { bg: string; text: string }> = {
    good: { bg: "bg-green-500/20", text: "text-green-600 dark:text-green-400" },
    acceptable: { bg: "bg-amber-500/20", text: "text-amber-600 dark:text-amber-400" },
    "needs-work": { bg: "bg-red-500/20", text: "text-red-600 dark:text-red-400" },
  };
  const c = config[assessment] ?? { bg: "bg-slate-500/20", text: "text-slate-600 dark:text-slate-400" };
  return (
    <span
      className={`inline-block rounded-full ${c.bg} px-2 py-0.5 text-[10px] font-medium ${c.text}`}
    >
      {assessment.replace("-", " ")}
    </span>
  );
}

function StudentRow({ group }: { group: StudentGroup }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  const doneCount = group.reviews.filter((r) => r.status === "done").length;
  const errorCount = group.reviews.filter((r) => r.status === "error").length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
      {/* Student header */}
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-400 dark:text-white/40" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 dark:text-white/40" />
        )}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-white/10">
          <User className="h-4 w-4 text-slate-400 dark:text-white/40" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-800 dark:text-white/80">
              {group.userName || group.userEmail}
            </span>
            {group.userName && (
              <span className="hidden truncate text-xs text-slate-400 dark:text-white/30 sm:block">
                {group.userEmail}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-white/40">
            <span>
              {group.reviewCount} review{group.reviewCount !== 1 ? "s" : ""}
            </span>
            <span className="text-slate-300 dark:text-white/20">|</span>
            <span>{doneCount} done</span>
            {errorCount > 0 && (
              <>
                <span className="text-slate-300 dark:text-white/20">|</span>
                <span className="text-red-500 dark:text-red-400">
                  {errorCount} error{errorCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-right">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-white/70">
              {group.avgFindings}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-white/30">
              avg findings
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-slate-500 dark:text-white/50">
              {new Date(group.lastReviewDate).toLocaleDateString()}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-white/30">
              last review
            </p>
          </div>
        </div>
      </button>

      {/* Expanded review list */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-2 dark:border-white/5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/5">
                <th className="pb-2 pt-3 pr-4 text-[11px] font-medium text-slate-400 dark:text-white/40">
                  File
                </th>
                <th className="pb-2 pt-3 pr-4 text-[11px] font-medium text-slate-400 dark:text-white/40">
                  Date
                </th>
                <th className="pb-2 pt-3 pr-4 text-[11px] font-medium text-slate-400 dark:text-white/40">
                  Status
                </th>
                <th className="pb-2 pt-3 pr-4 text-[11px] font-medium text-slate-400 dark:text-white/40">
                  Findings
                </th>
                <th className="pb-2 pt-3 pr-4 text-[11px] font-medium text-slate-400 dark:text-white/40">
                  Assessment
                </th>
                <th className="pb-2 pt-3 text-[11px] font-medium text-slate-400 dark:text-white/40"></th>
              </tr>
            </thead>
            <tbody>
              {group.reviews.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
                  onClick={() => router.push(`/review/${r.id}`)}
                >
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-white/20" />
                      <span className="max-w-[200px] truncate text-xs text-slate-700 dark:text-white/70">
                        {r.fileName ?? "\u2014"}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-500 dark:text-white/50">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-4">{statusBadge(r.status)}</td>
                  <td className="py-2 pr-4 text-xs text-slate-500 dark:text-white/50">
                    {r.status === "done" ? (
                      <span>
                        {r.findingCount} finding
                        {r.findingCount !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-white/25">
                        {"\u2014"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {r.status === "done" ? (
                      assessmentBadge(r.overallAssessment)
                    ) : (
                      <span className="text-xs text-slate-300 dark:text-white/25">
                        {"\u2014"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <ExternalLink className="inline h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function StudentList({ groups }: { groups: StudentGroup[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.userName.toLowerCase().includes(q) ||
        g.userEmail.toLowerCase().includes(q)
    );
  }, [groups, search]);

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/30" />
        <input
          type="text"
          placeholder="Search by student name or email..."
          aria-label="Search students"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:border-blue-500/50 dark:focus:bg-white/[0.07]"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Student rows */}
      <div className="space-y-2">
        {filtered.map((group) => (
          <StudentRow key={group.userId} group={group} />
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">
            {search ? "No students match your search" : "No reviews yet"}
          </p>
        )}
      </div>
    </div>
  );
}
