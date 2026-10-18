import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is deliberately memory-hard and ships with Node, so there is no native
 * module to compile — which matters more than it sounds on Windows, where a
 * bcrypt or argon2 install step is a recurring way for a setup to fail on a new
 * machine.
 *
 * Stored format: `scrypt$<salt base64>$<derived key base64>`. The scheme prefix
 * means a future change of parameters or algorithm can verify old hashes rather
 * than invalidating every password on the day it deploys.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCHEME = 'scrypt';

/**
 * NFKC so that a password typed with a different keyboard composition still
 * verifies. Without it, the same visible password can hash two ways.
 */
function normalise(plain: string): string {
  return plain.normalize('NFKC');
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(normalise(plain), salt, KEY_LENGTH);
  return [SCHEME, salt.toString('base64'), derived.toString('base64')].join(
    '$',
  );
}

export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltPart, hashPart] = stored.split('$');
  if (scheme !== SCHEME || !saltPart || !hashPart) return false;

  const salt = Buffer.from(saltPart, 'base64');
  const expected = Buffer.from(hashPart, 'base64');
  if (expected.length === 0) return false;

  const derived = await scryptAsync(normalise(plain), salt, expected.length);

  // Constant-time so a wrong password cannot be narrowed down by timing.
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}
