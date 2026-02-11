"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderType } from "@/types/review";
import { AVAILABLE_MODELS } from "@/types/review";

interface ProviderSelectProps {
  value: ProviderType;
  onChange: (value: ProviderType) => void;
  disabled?: boolean;
}

export function ProviderSelect({
  value,
  onChange,
  disabled,
}: ProviderSelectProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-white/70">LLM Provider</label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as ProviderType)}
        disabled={disabled}
      >
        <SelectTrigger className="border-white/10 bg-white/5 text-white backdrop-blur-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-white/10 bg-slate-900">
          {AVAILABLE_MODELS.map((m) => (
            <SelectItem key={m.provider} value={m.provider}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
