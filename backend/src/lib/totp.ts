import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Standard RFC 6238 TOTP (Time-based One-Time Password) implementation and
 * single-use backup code generator using Node.js standard crypto.
 *
 * Parameters:
 *   - Algorithm: HMAC-SHA1 (universal standard for authenticator apps)
 *   - Step: 30 seconds
 *   - Digits: 6
 *   - Tolerance window: ±1 step (allows 30s clock drift)
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TIME_STEP_SECONDS = 30;
const CODE_DIGITS = 6;
const BACKUP_CODE_COUNT = 8;

/**
 * Encodes a buffer into RFC 4648 Base32 string (without padding).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string into a Buffer.
 */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]!);
    if (val === -1) {
      throw new Error(`Invalid Base32 character: ${clean[i]}`);
    }
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically secure 160-bit (20-byte) Base32 TOTP secret.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Computes a 6-digit TOTP code for a secret and specific 30-second time step.
 */
export function computeTotpCode(
  secret: string,
  timeStep = Math.floor(Date.now() / 1000 / TIME_STEP_SECONDS),
): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(timeStep));

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;

  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binary % 10 ** CODE_DIGITS;
  return otp.toString().padStart(CODE_DIGITS, '0');
}

/**
 * Verifies a 6-digit TOTP code within a drift window (default ±1 step / 30s).
 * Constant-time comparison prevents timing analysis.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  window = 1,
): boolean {
  const cleanCode = code.trim();
  if (cleanCode.length !== CODE_DIGITS || !/^\d+$/.test(cleanCode)) {
    return false;
  }

  const currentStep = Math.floor(Date.now() / 1000 / TIME_STEP_SECONDS);
  const codeBuffer = Buffer.from(cleanCode);

  for (let offset = -window; offset <= window; offset++) {
    const candidate = computeTotpCode(secret, currentStep + offset);
    const candidateBuffer = Buffer.from(candidate);

    if (
      candidateBuffer.length === codeBuffer.length &&
      timingSafeEqual(candidateBuffer, codeBuffer)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Generates an otpauth:// URI for scanning with Google Authenticator, 1Password, etc.
 */
export function generateTotpUri(
  username: string,
  secret: string,
  issuer = 'Moka Cafe',
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(username)}`;
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=${CODE_DIGITS}&period=${TIME_STEP_SECONDS}`;
}

/**
 * Generates formatted single-use backup codes (e.g. "a1b2c3-d4e5f6").
 *
 * Six random bytes give 48 bits per code. The hashes are stored offline, so a
 * shorter code would be cheap to brute-force if the database ever leaked; 48
 * bits keeps that infeasible while staying short enough to type.
 */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const hex = randomBytes(6).toString('hex');
    codes.push(`${hex.slice(0, 6)}-${hex.slice(6, 12)}`);
  }
  return codes;
}

/**
 * Hashes a backup code with salted SHA-256 for secure storage at rest.
 * Format: `sha256$<salt hex>$<hash hex>`
 */
export function hashBackupCode(code: string): string {
  const salt = randomBytes(16);
  const normalized = code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const hash = createHash('sha256').update(salt).update(normalized).digest();

  return `sha256$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verifies a single backup code against a stored salted hash.
 */
function verifyBackupCode(code: string, storedHash: string): boolean {
  const [scheme, saltHex, expectedHex] = storedHash.split('$');
  if (scheme !== 'sha256' || !saltHex || !expectedHex) return false;

  const normalized = code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');

  const calculated = createHash('sha256').update(salt).update(normalized).digest();
  return (
    calculated.length === expected.length &&
    timingSafeEqual(calculated, expected)
  );
}

/**
 * Checks a provided code against the list of stored hashed backup codes.
 * If verified, consumes the code by returning remainingHashes without the matching code.
 */
export function verifyAndConsumeBackupCode(
  code: string,
  storedHashes: readonly string[],
): { valid: boolean; remainingHashes: string[]; matchedHash?: string } {
  const index = storedHashes.findIndex((hash) => verifyBackupCode(code, hash));

  if (index === -1) {
    return { valid: false, remainingHashes: [...storedHashes] };
  }

  // Remove the matched code to make it single-use
  const remaining = [...storedHashes];
  const matchedHash = remaining.splice(index, 1)[0]!;

  return { valid: true, remainingHashes: remaining, matchedHash };
}
