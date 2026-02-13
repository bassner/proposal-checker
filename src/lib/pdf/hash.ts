import "server-only";
import { createHash } from "crypto";

/**
 * Compute a SHA-256 hex digest of a PDF buffer.
 * Used for duplicate detection — same content hash = same document.
 */
export function hashPDFContent(buffer: ArrayBuffer): string {
  return createHash("sha256")
    .update(Buffer.from(buffer))
    .digest("hex");
}
