import { getEncoding, type Tiktoken } from "js-tiktoken";

/** Lazily initialized singleton — encoding init is expensive, so we cache it. */
let _enc: Tiktoken | null = null;
function getTokenizer(): Tiktoken {
  if (!_enc) _enc = getEncoding("o200k_base");
  return _enc;
}

/**
 * Count the number of tokens in a string using the `o200k_base` BPE encoding.
 * This is the same tokenizer used by GPT-4o and later models, so counts closely
 * match actual API usage. Used for input token estimates in the progress UI.
 */
export function countTokens(text: string): number {
  return getTokenizer().encode(text).length;
}
