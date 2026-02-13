"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderType, ModelConfig } from "@/types/review";

interface ProviderSelectProps {
  value: ProviderType;
  onChange: (value: ProviderType) => void;
  disabled?: boolean;
  models: ModelConfig[];
}

export function ProviderSelect({
  value,
  onChange,
  disabled,
  models,
}: ProviderSelectProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-600 dark:text-white/70">LLM Provider</label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as ProviderType)}
        disabled={disabled}
      >
        <SelectTrigger className="border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:backdrop-blur-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
          {models.map((m) => (
            <SelectItem key={m.provider} value={m.provider}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
