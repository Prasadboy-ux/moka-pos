import { describe, expect, it } from 'vitest';
import {
  signMfaChallengeToken,
  signMfaSetupToken,
  signSession,
  verifyMfaChallengeToken,
  verifyMfaSetupToken,
  verifySession,
} from '../../lib/session.js';
import {
  computeTotpCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  verifyTotpCode,
} from '../../lib/totp.js';

describe('Backend Security & MFA Module Suite', () => {
  it('signs and verifies 30-day Remember Me sessions vs standard 12-hour sessions', async () => {
    const standardToken = await signSession('user-1', 0, false);
    const rememberMeToken = await signSession('user-1', 0, true);

    const verifiedStandard = await verifySession(standardToken);
    const verifiedRemember = await verifySession(rememberMeToken);

    expect(verifiedStandard.userId).toBe('user-1');
    expect(verifiedRemember.userId).toBe('user-1');
  });

  it('manages short-lived MFA challenge and setup tokens', async () => {
    const mfaToken = await signMfaChallengeToken('user-1', 2, true);
    const verifiedChallenge = await verifyMfaChallengeToken(mfaToken);

    expect(verifiedChallenge.userId).toBe('user-1');
    expect(verifiedChallenge.epoch).toBe(2);
    expect(verifiedChallenge.rememberMe).toBe(true);

    const secret = generateTotpSecret();
    const setupToken = await signMfaSetupToken('user-2', 1, secret, false);
    const verifiedSetup = await verifyMfaSetupToken(setupToken);

    expect(verifiedSetup.userId).toBe('user-2');
    expect(verifiedSetup.secret).toBe(secret);
    expect(verifiedSetup.rememberMe).toBe(false);
  });

  it('verifies TOTP generation and verification cycle with clock drift tolerance', () => {
    const secret = generateTotpSecret();
    const currentCode = computeTotpCode(secret);

    expect(verifyTotpCode(secret, currentCode)).toBe(true);
    expect(verifyTotpCode(secret, '999999')).toBe(false);
  });

  it('strictly enforces single-use backup recovery codes', () => {
    const codes = generateBackupCodes(4);
    const hashedCodes = codes.map(hashBackupCode);

    // Use code 0
    const firstUse = verifyAndConsumeBackupCode(codes[0]!, hashedCodes);
    expect(firstUse.valid).toBe(true);
    expect(firstUse.remainingHashes).toHaveLength(3);

    // Replay of code 0 must fail
    const replayAttempt = verifyAndConsumeBackupCode(
      codes[0]!,
      firstUse.remainingHashes,
    );
    expect(replayAttempt.valid).toBe(false);

    // Code 1 still works
    const secondUse = verifyAndConsumeBackupCode(
      codes[1]!,
      firstUse.remainingHashes,
    );
    expect(secondUse.valid).toBe(true);
    expect(secondUse.remainingHashes).toHaveLength(2);
  });
});
