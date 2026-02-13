"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, ChevronDown, X, Loader2 } from "lucide-react";

interface UserOption {
  id: string;
  name: string;
  role: string;
}

interface UserSearchSelectProps {
  /** Comma-separated roles to filter by, e.g. "phd,admin" */
  roles: string;
  value: string | null;
  onChange: (userId: string | null) => void;
  label: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export function UserSearchSelect({
  roles,
  value,
  onChange,
  label,
  placeholder = "Search by name...",
  required = false,
  disabled = false,
}: UserSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch users on mount (no query) and when query changes
  const fetchUsers = useCallback(
    async (searchQuery: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.set("q", searchQuery);
        params.set("role", roles);
        const res = await fetch(`/api/users?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        setOptions(data.users ?? []);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    },
    [roles]
  );

  // Initial fetch
  useEffect(() => {
    fetchUsers("");
  }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchUsers(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchUsers]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Resolve selected user from value
  useEffect(() => {
    if (!value) {
      setSelectedUser(null);
      return;
    }
    // Check if already in options
    const found = options.find((u) => u.id === value);
    if (found) {
      setSelectedUser(found);
    }
  }, [value, options]);

  const handleSelect = (user: UserOption) => {
    setSelectedUser(user);
    onChange(user.id);
    setOpen(false);
    setQuery("");
  };

  const handleClear = () => {
    setSelectedUser(null);
    onChange(null);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/50">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>

      {selectedUser ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[10px] font-medium text-blue-500 dark:bg-blue-500/20 dark:text-blue-400">
              {selectedUser.name.charAt(0).toUpperCase()}
            </div>
            <span className="truncate text-sm text-slate-700 dark:text-white/70">{selectedUser.name}</span>
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-white/5 dark:text-white/30">
              {selectedUser.role}
            </span>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="ml-2 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!disabled) {
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
          disabled={disabled}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm text-slate-400 transition-colors hover:border-slate-300 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/30 dark:hover:border-white/20"
        >
          <span>{placeholder}</span>
          <ChevronDown className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-white/5">
            <Search className="h-3.5 w-3.5 text-slate-400 dark:text-white/30" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name..."
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-300 outline-none dark:text-white/70 dark:placeholder:text-white/20"
            />
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 dark:text-white/30" />}
          </div>

          <div className="max-h-48 overflow-y-auto py-1">
            {options.length === 0 && !loading && (
              <div className="px-3 py-4 text-center text-xs text-slate-400 dark:text-white/30">
                No users found
              </div>
            )}
            {options.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelect(user)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[10px] font-medium text-blue-500 dark:bg-blue-500/20 dark:text-blue-400">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate text-slate-700 dark:text-white/70">{user.name}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-white/5 dark:text-white/30">
                  {user.role}
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 px-3 py-2 dark:border-white/5">
            <p className="text-[10px] text-slate-400 dark:text-white/25">
              Can&apos;t find someone? They need to log in at least once.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
