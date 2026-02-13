import "server-only";
import { timingSafeEqual, randomBytes, pbkdf2 } from "node:crypto";

/**
 * PBKDF2-based password hashing for share link protection.
 *
 * Hash format: "v1:<iterations>:<salt_hex>:<hash_hex>"
 * - v1 = versioned format for future migration
 * - 200k iterations PBKDF2-SHA256
 * - 32-byte random salt per link
 * - 32-byte derived key
 */

const HASH_VERSION = "v1";
const ITERATIONS = 200_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const DIGEST = "sha256";

function pbkdf2Async(
  password: string,
  salt: Buffer,
  iterations: number,
  keyLength: number,
  digest: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, keyLength, digest, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Hash a plaintext password with a random salt. Returns a versioned hash string. */
export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `${HASH_VERSION}:${ITERATIONS}:${salt.toString("hex")}:${key.toString("hex")}`;
}

/** Verify a plaintext password against a stored hash. Constant-time comparison. */
export async function verifySharePassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 4 || parts[0] !== HASH_VERSION) {
    return false;
  }

  const iterations = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], "hex");
  const expectedKey = Buffer.from(parts[3], "hex");

  if (isNaN(iterations) || salt.length !== SALT_LENGTH || expectedKey.length !== KEY_LENGTH) {
    return false;
  }

  const derivedKey = await pbkdf2Async(password, salt, iterations, KEY_LENGTH, DIGEST);

  // Constant-time comparison — both buffers are always KEY_LENGTH bytes
  return timingSafeEqual(derivedKey, expectedKey);
}
