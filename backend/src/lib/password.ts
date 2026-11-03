import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  argon2 as nodeArgon2,
  type Argon2Algorithm,
  type Argon2Parameters,
} from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Modern password hashing supporting native Argon2id (Node 24+) with seamless
 * backwards-compatibility for existing scrypt hashes.
 *
 * Stored format:
 *   - Argon2id: `argon2id$<salt base64>$<derived key base64>`
 *   - Scrypt:   `scrypt$<salt base64>$<derived key base64>`
 *
 * OWASP parameters for Argon2id:
 *   - Memory: 64 MiB (65536 KiB)
 *   - Iterations: 3 passes
 *   - Parallelism: 1 thread
 *   - Tag length: 32 bytes
 *
 * Existing accounts stored as `scrypt` continue to verify seamlessly and are
 * transparently migrated to `argon2id` upon successful login.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const argon2Async = nodeArgon2
  ? (promisify(nodeArgon2) as (
      algorithm: Argon2Algorithm,
      parameters: Argon2Parameters,
    ) => Promise<Buffer>)
  : undefined;

const SCHEME_ARGON2ID = 'argon2id';
const SCHEME_SCRYPT = 'scrypt';

const ARGON2ID_MEMORY = 65536; // 64 MiB
const ARGON2ID_PASSES = 3;
const ARGON2ID_PARALLELISM = 1;
const ARGON2ID_TAG_LENGTH = 32;

const SCRYPT_KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * NFKC normalization ensures that passwords composed on different input methods
 * produce identical byte representations.
 */
function normalise(plain: string): string {
  return plain.normalize('NFKC');
}

/**
 * Hashes a plain-text password using Argon2id (or scrypt fallback if unavailable).
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const normalized = normalise(plain);

  if (argon2Async) {
    const derived = await argon2Async(SCHEME_ARGON2ID, {
      message: normalized,
      nonce: salt,
      memory: ARGON2ID_MEMORY,
      passes: ARGON2ID_PASSES,
      parallelism: ARGON2ID_PARALLELISM,
      tagLength: ARGON2ID_TAG_LENGTH,
    });
    return [
      SCHEME_ARGON2ID,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$');
  }

  // Fallback for runtimes without native crypto.argon2
  const derived = await scryptAsync(normalized, salt, SCRYPT_KEY_LENGTH);
  return [
    SCHEME_SCRYPT,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verifies a plain-text password against a stored hash string.
 * Dispatches by scheme prefix in constant time.
 */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltPart, hashPart] = stored.split('$');
  if (!scheme || !saltPart || !hashPart) return false;

  const salt = Buffer.from(saltPart, 'base64');
  const expected = Buffer.from(hashPart, 'base64');
  if (expected.length === 0 || salt.length === 0) return false;

  const normalized = normalise(plain);

  if (scheme === SCHEME_ARGON2ID && argon2Async) {
    try {
      const derived = await argon2Async(SCHEME_ARGON2ID, {
        message: normalized,
        nonce: salt,
        memory: ARGON2ID_MEMORY,
        passes: ARGON2ID_PASSES,
        parallelism: ARGON2ID_PARALLELISM,
        tagLength: expected.length,
      });

      return (
        derived.length === expected.length && timingSafeEqual(derived, expected)
      );
    } catch {
      return false;
    }
  }

  if (scheme === SCHEME_SCRYPT) {
    try {
      const derived = await scryptAsync(normalized, salt, expected.length);
      return (
        derived.length === expected.length && timingSafeEqual(derived, expected)
      );
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Returns true if the stored hash uses a legacy scheme (such as scrypt)
 * that should be upgraded to Argon2id upon next authentication.
 */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`${SCHEME_ARGON2ID}$`);
}
