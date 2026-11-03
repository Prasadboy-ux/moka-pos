import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './encryption.js';

describe('AES-256-GCM secret encryption at rest', () => {
  it('encrypts and decrypts sensitive values accurately', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(secret);

    expect(encrypted.startsWith('aes256gcm$')).toBe(true);
    expect(encrypted).not.toContain(secret);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('produces distinct ciphertexts for identical inputs due to random IVs', () => {
    const secret = 'SECRET_TOTP_KEY_EXAMPLE';
    const enc1 = encryptSecret(secret);
    const enc2 = encryptSecret(secret);

    expect(enc1).not.toBe(enc2);
    expect(decryptSecret(enc1)).toBe(secret);
    expect(decryptSecret(enc2)).toBe(secret);
  });

  it('returns null on corrupted ciphertext or tampered auth tag', () => {
    const encrypted = encryptSecret('confidential');
    const parts = encrypted.split('$');
    // Tamper with the ciphertext
    parts[3] = Buffer.from('tampered-ciphertext').toString('base64');
    const tampered = parts.join('$');

    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret('invalid-payload-format')).toBeNull();
  });
});
