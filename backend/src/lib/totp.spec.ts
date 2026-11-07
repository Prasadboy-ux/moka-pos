import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  computeTotpCode,
  generateBackupCodes,
  generateTotpSecret,
  generateTotpUri,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  verifyTotpCode,
} from './totp.js';

describe('RFC 6238 TOTP and backup codes', () => {
  it('correctly encodes and decodes Base32 buffers', () => {
    const original = Buffer.from('HelloWorld123', 'utf8');
    const encoded = base32Encode(original);
    const decoded = base32Decode(encoded);

    expect(decoded.toString('utf8')).toBe('HelloWorld123');
  });

  it('generates a valid TOTP secret and computes a 6-digit code', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThanOrEqual(32);

    const code = computeTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);

    expect(verifyTotpCode(secret, code)).toBe(true);
    expect(verifyTotpCode(secret, '000000')).toBe(false);
    expect(verifyTotpCode(secret, 'invalid')).toBe(false);
  });

  it('tolerates ±1 30-second time step drift during verification', () => {
    const secret = generateTotpSecret();
    const currentStep = Math.floor(Date.now() / 1000 / 30);

    const pastCode = computeTotpCode(secret, currentStep - 1);
    const futureCode = computeTotpCode(secret, currentStep + 1);
    const tooOldCode = computeTotpCode(secret, currentStep - 2);

    expect(verifyTotpCode(secret, pastCode)).toBe(true);
    expect(verifyTotpCode(secret, futureCode)).toBe(true);
    expect(verifyTotpCode(secret, tooOldCode, 1)).toBe(false);
  });

  it('generates otpauth URI with appropriate labeling and parameters', () => {
    const uri = generateTotpUri('admin', 'JBSWY3DPEHPK3PXP', 'Moka Cafe');
    expect(uri).toContain('otpauth://totp/Moka%20Cafe:admin?');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Moka%20Cafe');
  });

  it('generates 48-bit backup codes in the typed format', () => {
    const codes = generateBackupCodes(8);

    expect(new Set(codes)).toHaveLength(8);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{6}-[0-9a-f]{6}$/);
    }
  });

  it('still accepts a legacy 8-character backup code', () => {
    const legacy = 'a1b2-c3d4';
    const result = verifyAndConsumeBackupCode(legacy, [
      hashBackupCode(legacy),
    ]);

    expect(result.valid).toBe(true);
    expect(result.remainingHashes).toHaveLength(0);
  });

  it('generates and consumes single-use backup codes', () => {
    const codes = generateBackupCodes(4);
    expect(codes).toHaveLength(4);

    const hashedCodes = codes.map(hashBackupCode);

    // Verify first code
    const result1 = verifyAndConsumeBackupCode(codes[0]!, hashedCodes);
    expect(result1.valid).toBe(true);
    expect(result1.remainingHashes).toHaveLength(3);

    // Attempting to reuse the consumed code must fail
    const reuseAttempt = verifyAndConsumeBackupCode(
      codes[0]!,
      result1.remainingHashes,
    );
    expect(reuseAttempt.valid).toBe(false);

    // Invalid code fails
    const invalidAttempt = verifyAndConsumeBackupCode(
      'xxxx-yyyy',
      result1.remainingHashes,
    );
    expect(invalidAttempt.valid).toBe(false);
  });
});
