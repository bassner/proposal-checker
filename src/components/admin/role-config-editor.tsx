"use client";

import { useState } from "react";
import type { AppRole } from "@/lib/auth/roles";
import type { ProviderType } from "@/types/review";
import { Loader2, Check, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface Props {
  initialConfig: Record<AppRole, ProviderType[]>;
}

export function RoleConfigEditor({ initialConfig }: Props) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const toggleProvider = async (role: AppRole, provider: ProviderType) => {
    // Prevent concurrent requests for same role
    if (saving[role]) return;

    const current = config[role];
    const updated = current.includes(provider)
      ? current.filter((p) => p !== provider)
      : [...current, provider];

    // Validation: at least one provider required (shouldn't happen due to disabled checkbox)
    if (updated.length === 0) return;

    // Loading state (functional updates to prevent races)
    setSaving((prev) => ({ ...prev, [role]: true }));
    setSuccess((prev) => ({ ...prev, [role]: false }));
    setError(null);

    try {
      const res = await fetch("/api/admin/role-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, providers: updated }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Update failed");
      }

      const { config: serverConfig } = await res.json();

      // Use server-returned canonical state, not local optimistic state
      setConfig((prev) => ({
        ...prev,
        [serverConfig.role]: serverConfig.providers,
      }));
      setSuccess((prev) => ({ ...prev, [role]: true }));

      // Clear success indicator after 2s
      setTimeout(() => {
        setSuccess((prev) => ({ ...prev, [role]: false }));
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      // Auto-clear error after 5s
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving((prev) => ({ ...prev, [role]: false }));
    }
  };

  const providers: ProviderType[] = ["azure", "ollama"];
  const roles: AppRole[] = ["admin", "phd", "student"];

  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-2 pr-6 text-xs font-medium text-white/40">Role</th>
              {providers.map((p) => (
                <th key={p} className="pb-2 pr-4 text-center text-xs font-medium text-white/40">
                  {p}
                </th>
              ))}
              <th className="pb-2 text-xs font-medium text-white/40"></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role} className="border-b border-white/5">
                <td className="py-3 pr-6 font-medium text-white/70">{role}</td>
                {providers.map((provider) => {
                  const checked = config[role].includes(provider);
                  const isLast = config[role].length === 1 && checked;
                  return (
                    <td key={provider} className="py-3 pr-4 text-center">
                      {/* Wrap checkbox in interactive span for tooltip to work on disabled input */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-block">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isLast || saving[role]}
                              onChange={() => toggleProvider(role, provider)}
                              className="h-4 w-4 cursor-pointer rounded border-white/20 bg-white/5 text-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
                            />
                          </span>
                        </TooltipTrigger>
                        {isLast && (
                          <TooltipContent>
                            <p className="text-xs">At least one provider required</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </td>
                  );
                })}
                <td className="py-3 text-right">
                  {saving[role] && (
                    <Loader2 className="inline h-4 w-4 animate-spin text-blue-400" />
                  )}
                  {success[role] && <Check className="inline h-4 w-4 text-green-400" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
