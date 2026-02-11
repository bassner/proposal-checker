import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getEncoding, type Tiktoken } from "js-tiktoken"

let _enc: Tiktoken | null = null;
function getTokenizer(): Tiktoken {
  if (!_enc) _enc = getEncoding("o200k_base");
  return _enc;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format token count as "k" (e.g. 100 → "0.1k", 1500 → "1.5k", 12345 → "12.3k") */
export function formatTokensK(tokens: number): string {
  return (tokens / 1000).toFixed(1) + "k";
}

// GPT-5.2 pricing per 1M tokens
const INPUT_COST_PER_TOKEN = 1.75 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 14.0 / 1_000_000;

/** Estimate cost from input + output token counts (GPT-5.2 pricing) */
export function estimateCost(inputTokens: number, outputTokens: number): string {
  const cost =
    inputTokens * INPUT_COST_PER_TOKEN +
    outputTokens * OUTPUT_COST_PER_TOKEN;
  if (cost < 0.005) return "<$0.01";
  return `~$${cost.toFixed(2)}`;
}

/** Count tokens using the o200k_base tokenizer (same as GPT-4o / GPT-5.2) */
export function countTokens(text: string): number {
  return getTokenizer().encode(text).length;
}

/** Calculate tokens per second given token count and start/end timestamps */
export function calcTokPerSec(
  tokens: number,
  startTime: number,
  endTime?: number
): string {
  const elapsed = ((endTime ?? Date.now()) - startTime) / 1000;
  if (elapsed <= 0) return "–";
  const rate = tokens / elapsed;
  return rate < 10 ? rate.toFixed(1) : Math.round(rate).toString();
}
