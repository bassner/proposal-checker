import "server-only";
import { mkdir, writeFile, readFile, readdir, stat, unlink, realpath } from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/proposal-checker-uploads";
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

let resolvedUploadDir: string | null = null;

/** Ensure upload directory exists and resolve its real path (symlink-safe). */
async function ensureUploadDir(): Promise<string> {
  if (resolvedUploadDir) return resolvedUploadDir;
  await mkdir(UPLOAD_DIR, { recursive: true });
  resolvedUploadDir = await realpath(UPLOAD_DIR);
  return resolvedUploadDir;
}

/**
 * Validate that a file path is within the upload directory.
 * Prevents directory traversal attacks if DB data is tampered with.
 */
async function validatePath(filePath: string): Promise<string> {
  const uploadDir = await ensureUploadDir();
  const resolved = path.resolve(filePath);
  // Ensure the resolved path starts with the upload dir + separator
  if (!resolved.startsWith(uploadDir + path.sep) && resolved !== uploadDir) {
    throw new Error("Invalid file path: outside upload directory");
  }
  return resolved;
}

/**
 * Save a PDF buffer to disk. Returns the absolute file path.
 * Uses the review ID as filename to ensure uniqueness.
 */
export async function savePdf(id: string, buffer: ArrayBuffer): Promise<string> {
  const uploadDir = await ensureUploadDir();
  // Sanitize ID to prevent path traversal via crafted UUIDs
  const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
  const filePath = path.join(uploadDir, `${safeId}.pdf`);
  await writeFile(filePath, Buffer.from(buffer));
  return filePath;
}

/**
 * Read a PDF from disk by its stored path.
 * Validates the path is within UPLOAD_DIR for safety.
 * Returns null if the file no longer exists (cleaned up).
 */
export async function readPdf(filePath: string): Promise<ArrayBuffer | null> {
  try {
    const validated = await validatePath(filePath);
    const buffer = await readFile(validated);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Delete PDF files older than 24 hours from the upload directory.
 * Runs as a periodic cleanup task.
 */
async function cleanupOldPdfs(): Promise<void> {
  try {
    const uploadDir = await ensureUploadDir();
    const files = await readdir(uploadDir);
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      if (!file.endsWith(".pdf")) continue;
      const filePath = path.join(uploadDir, file);
      try {
        const fileStat = await stat(filePath);
        if (now - fileStat.mtimeMs > MAX_FILE_AGE_MS) {
          await unlink(filePath);
          cleaned++;
        }
      } catch {
        // File may have been deleted by another process
      }
    }

    if (cleaned > 0) {
      console.log(`[uploads] Cleaned up ${cleaned} expired PDF file(s)`);
    }
  } catch (err) {
    console.error("[uploads] Cleanup failed:", err);
  }
}

// Schedule periodic cleanup (survives HMR via globalThis)
const globalUploads = globalThis as unknown as { __uploadCleanup?: boolean };
if (!globalUploads.__uploadCleanup) {
  globalUploads.__uploadCleanup = true;
  setInterval(cleanupOldPdfs, CLEANUP_INTERVAL_MS).unref();
}
