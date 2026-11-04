import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Symmetric authenticated encryption (AES-256-GCM) for sensitive data at rest
 * (such as TOTP MFA secrets).
 *
 * Stored format: `aes256gcm$<iv base64>$<authTag base64>$<ciphertext base64>`
 *
 * Key is derived deterministically from SESSION_SECRET using HKDF-SHA256, so
 * there are no additional secret configuration variables required while maintaining
 * cryptographic separation between session tokens and database encryption.
 */

const SCHEME = 'aes256gcm';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const KEY_LENGTH = 32; // 256 bits for AES-256
const HKDF_INFO = 'moka-pos-mfa-encryption';

let cachedKey: Buffer | undefined;

function getEncryptionKey(): Buffer {
  cachedKey ??= Buffer.from(
    hkdfSync('sha256', env().SESSION_SECRET, '', HKDF_INFO, KEY_LENGTH),
  );
  return cachedKey;
}

/**
 * Encrypts a sensitive string value using AES-256-GCM.
 */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const key = getEncryptionKey();

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SCHEME,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join('$');
}

/**
 * Decrypts an AES-256-GCM encrypted string, validating authentication tag.
 * Returns null if decryption or authentication fails.
 */
export function decryptSecret(payload: string): string | null {
  const [scheme, ivPart, authTagPart, cipherPart] = payload.split('$');
  if (scheme !== SCHEME || !ivPart || !authTagPart || !cipherPart) {
    return null;
  }

  try {
    const iv = Buffer.from(ivPart, 'base64');
    const authTag = Buffer.from(authTagPart, 'base64');
    const encrypted = Buffer.from(cipherPart, 'base64');

    if (iv.length !== IV_LENGTH || authTag.length !== 16) {
      return null;
    }

    const key = getEncryptionKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
