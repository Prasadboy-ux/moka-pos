import { env } from '../../config/env.js';
import { ApiError } from '../../lib/errors.js';
import { decryptSecret, encryptSecret } from '../../lib/encryption.js';
import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../../lib/password.js';
import {
  signMfaChallengeToken,
  signMfaSetupToken,
  verifyMfaChallengeToken,
  verifyMfaSetupToken,
  verifySession,
} from '../../lib/session.js';
import {
  generateBackupCodes,
  generateTotpSecret,
  generateTotpUri,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  verifyTotpCode,
} from '../../lib/totp.js';
import {
  type SessionUser,
  findByUsername,
  toSessionUser,
  UserModel,
} from '../../models/user.model.js';
import type {
  ChangePasswordInput,
  LoginInput,
  MfaBackupCodesRegenerateInput,
  MfaSetupConfirmInput,
  MfaVerifyInput,
} from './auth.schemas.js';

export type AuthResult =
  | {
      status: 'authenticated';
      user: SessionUser;
      sessionEpoch: number;
      rememberMe?: boolean;
    }
  | {
      status: 'mfa_required';
      mfaToken: string;
      username: string;
      /** How many single-use recovery codes remain. Drives the low-codes warning. */
      backupCodesRemaining: number;
      rememberMe?: boolean;
    }
  | {
      status: 'mfa_setup_required';
      setupToken: string;
      secret: string;
      qrUri: string;
      username: string;
      rememberMe?: boolean;
    };

/**
 * Authenticates staff accounts with multi-scheme password verification,
 * transparent hash migration to Argon2id, and role-based MFA enforcement.
 */
export async function authenticate(input: LoginInput): Promise<AuthResult> {
  const user = await findByUsername(input.username).select(
    '+passwordHash +mfaSecret +mfaBackupCodes',
  );

  if (!user) {
    await burnTime();
    throw invalidCredentials();
  }

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw invalidCredentials();
  }

  if (!user.isActive) {
    throw ApiError.unauthenticated(
      'This account has been deactivated. Ask an administrator to restore it.',
      'inactive',
    );
  }

  if (input.role !== undefined && input.role !== user.role) {
    throw ApiError.forbidden(
      `This account belongs to the ${user.role === 'admin' ? 'Admin' : 'Cashier'} role. Select that role and try again.`,
      'role-mismatch',
    );
  }

  // Transparently upgrade legacy scrypt hashes to modern Argon2id on successful sign-in
  if (needsRehash(user.passwordHash)) {
    try {
      user.passwordHash = await hashPassword(input.password);
      await user.save();
    } catch {
      // Non-fatal: if save fails, proceed with the authenticated session
    }
  }

  const rememberMe = Boolean(input.rememberMe);

  // If MFA is already enabled, issue an MFA challenge token
  if (user.mfaEnabled) {
    const mfaToken = await signMfaChallengeToken(
      String(user._id),
      user.sessionEpoch ?? 0,
      rememberMe,
    );
    return {
      status: 'mfa_required',
      mfaToken,
      username: user.username,
      backupCodesRemaining: (user.mfaBackupCodes ?? []).length,
      rememberMe,
    };
  }

  // MFA Policy: mandatory for admins outside tests. An explicit
  // MFA_ENFORCE_ADMIN overrides the test default, so the smoke stack can seed
  // and sign in demo admins while the dedicated MFA suite exercises enrolment.
  const { MFA_ENFORCE_ADMIN, NODE_ENV } = env();
  const enforceAdminMfa =
    user.role === 'admin' &&
    (MFA_ENFORCE_ADMIN ?? NODE_ENV !== 'test');

  if (enforceAdminMfa) {
    const secret = generateTotpSecret();
    const qrUri = generateTotpUri(user.username, secret, 'Moka Cafe');
    const setupToken = await signMfaSetupToken(
      String(user._id),
      user.sessionEpoch ?? 0,
      secret,
      rememberMe,
    );

    return {
      status: 'mfa_setup_required',
      setupToken,
      secret,
      qrUri,
      username: user.username,
      rememberMe,
    };
  }

  return {
    status: 'authenticated',
    user: toSessionUser(user),
    sessionEpoch: user.sessionEpoch ?? 0,
    rememberMe,
  };
}

/**
 * Completes MFA verification for an existing enabled account using either
 * a 6-digit TOTP code or a single-use backup code.
 */
export async function verifyMfaLogin(
  input: MfaVerifyInput,
): Promise<{ user: SessionUser; sessionEpoch: number; rememberMe: boolean }> {
  const { userId, epoch, rememberMe } = await verifyMfaChallengeToken(
    input.mfaToken,
  );

  const user = await UserModel.findById(userId).select(
    '+mfaSecret +mfaBackupCodes',
  );

  if (
    !user ||
    !user.isActive ||
    (user.sessionEpoch ?? 0) !== epoch ||
    !user.mfaSecret
  ) {
    throw ApiError.unauthenticated(
      'MFA challenge has expired or is invalid. Please sign in again.',
    );
  }

  const plainSecret = decryptSecret(user.mfaSecret);
  if (!plainSecret) {
    throw ApiError.internal('Unable to verify MFA secret.');
  }

  const cleanCode = input.code.trim();

  // 1. Try TOTP code verification
  if (cleanCode.length === 6 && /^\d+$/.test(cleanCode)) {
    if (verifyTotpCode(plainSecret, cleanCode)) {
      return {
        user: toSessionUser(user),
        sessionEpoch: user.sessionEpoch ?? 0,
        rememberMe,
      };
    }
  }

  // 2. Try single-use backup code verification
  const backupResult = verifyAndConsumeBackupCode(
    cleanCode,
    user.mfaBackupCodes ?? [],
  );

  if (backupResult.valid && backupResult.matchedHash) {
    // Consume the code atomically. Reading the list and then saving the trimmed
    // copy lets two concurrent requests use the same recovery code; a
    // conditional $pull lets exactly one request remove the matching hash.
    const consumed = await UserModel.updateOne(
      {
        _id: user._id,
        isActive: true,
        mfaEnabled: true,
        sessionEpoch: epoch,
        mfaBackupCodes: backupResult.matchedHash,
      },
      { $pull: { mfaBackupCodes: backupResult.matchedHash } },
    );

    if (consumed.modifiedCount === 1) {
      return {
        user: toSessionUser(user),
        sessionEpoch: user.sessionEpoch ?? 0,
        rememberMe,
      };
    }
  }

  throw ApiError.unauthenticated(
    'Invalid verification code. Please check your authenticator app or backup code.',
    'invalid_mfa',
  );
}

/**
 * Confirms mandatory MFA enrollment by verifying the user's first TOTP code,
 * storing the encrypted secret, generating salted single-use recovery codes,
 * and returning the user session.
 */
export async function confirmMfaSetup(
  input: MfaSetupConfirmInput,
): Promise<{
  user: SessionUser;
  sessionEpoch: number;
  backupCodes: string[];
  rememberMe: boolean;
}> {
  const { userId, epoch, secret, rememberMe } = await verifyMfaSetupToken(
    input.setupToken,
  );

  const user = await UserModel.findById(userId);
  if (!user || !user.isActive || (user.sessionEpoch ?? 0) !== epoch) {
    throw ApiError.unauthenticated(
      'MFA setup session expired. Please sign in again to continue setup.',
    );
  }

  if (!verifyTotpCode(secret, input.code)) {
    throw ApiError.unauthenticated(
      'Invalid 6-digit code. Please enter the current code shown in your authenticator app.',
      'invalid_mfa',
    );
  }

  const plainBackupCodes = generateBackupCodes(8);
  const hashedBackupCodes = plainBackupCodes.map(hashBackupCode);

  user.mfaEnabled = true;
  user.mfaSecret = encryptSecret(secret);
  user.mfaBackupCodes = hashedBackupCodes;
  user.sessionEpoch = (user.sessionEpoch ?? 0) + 1; // Session rotation
  await user.save();

  return {
    user: toSessionUser(user),
    sessionEpoch: user.sessionEpoch ?? 0,
    backupCodes: plainBackupCodes,
    rememberMe,
  };
}

/**
 * Reports whether MFA is on and how many single-use recovery codes are left.
 * Only the count crosses the wire — the hashes never leave the database.
 */
export async function getMfaStatus(userId: string): Promise<{
  mfaEnabled: boolean;
  backupCodesRemaining: number;
}> {
  const user = await UserModel.findById(userId).select('+mfaBackupCodes');

  if (!user || !user.isActive) {
    throw ApiError.unauthenticated(
      'Your session is no longer valid. Please sign in again.',
    );
  }

  return {
    mfaEnabled: Boolean(user.mfaEnabled),
    backupCodesRemaining: user.mfaEnabled
      ? (user.mfaBackupCodes ?? []).length
      : 0,
  };
}

/**
 * Issues a fresh set of recovery codes, invalidating every previous code.
 *
 * Requires the current password and a live TOTP code: regenerating is the one
 * action that can restore sign-in access, so a hijacked session on its own must
 * not be enough to perform it. The session is intentionally left alive — the
 * user is already signed in and rotating codes does not change the authenticator
 * secret.
 */
export async function regenerateBackupCodes(
  userId: string,
  input: MfaBackupCodesRegenerateInput,
): Promise<{ backupCodes: string[] }> {
  const user = await UserModel.findById(userId).select(
    '+passwordHash +mfaSecret +mfaBackupCodes',
  );

  if (!user || !user.isActive) {
    throw ApiError.unauthenticated(
      'Your session is no longer valid. Please sign in again.',
    );
  }

  if (!user.mfaEnabled || !user.mfaSecret) {
    throw ApiError.validation(
      'Two-factor authentication is not enabled on this account.',
    );
  }

  const matches = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!matches) {
    throw ApiError.validation('That is not your current password.', {
      currentPassword: 'That is not your current password.',
    });
  }

  const plainSecret = decryptSecret(user.mfaSecret);
  if (!plainSecret) {
    throw ApiError.internal('Unable to verify MFA secret.');
  }

  if (!verifyTotpCode(plainSecret, input.code)) {
    throw ApiError.unauthenticated(
      'Invalid 6-digit code. Please enter the current code shown in your authenticator app.',
      'invalid_mfa',
    );
  }

  const plainBackupCodes = generateBackupCodes(8);
  user.mfaBackupCodes = plainBackupCodes.map(hashBackupCode);
  await user.save();

  return { backupCodes: plainBackupCodes };
}

function invalidCredentials(): ApiError {
  return ApiError.unauthenticated(
    'That username and password do not match an account.',
    'invalid',
  );
}

/**
 * Stands in for a real password verification when there is no user to compare against.
 */
async function burnTime(): Promise<void> {
  await verifyPassword(
    'no-such-user-placeholder',
    'argon2id$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  );
}

/**
 * Lets signed-in users rotate their own password.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash');

  if (!user || !user.isActive) {
    throw ApiError.unauthenticated(
      'Your session is no longer valid. Please sign in again.',
    );
  }

  const matches = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!matches) {
    throw ApiError.validation('That is not your current password.', {
      currentPassword: 'That is not your current password.',
    });
  }

  if (input.newPassword === input.currentPassword) {
    throw ApiError.validation(
      'The new password must be different from the current one.',
      {
        newPassword: 'The new password must be different from the current one.',
      },
    );
  }

  user.passwordHash = await hashPassword(input.newPassword);
  user.sessionEpoch = (user.sessionEpoch ?? 0) + 1;
  await user.save();
}

/**
 * Revokes every session belonging to the token's account.
 */
export async function revokeSessionsForToken(token: string): Promise<void> {
  let session: Awaited<ReturnType<typeof verifySession>>;
  try {
    session = await verifySession(token);
  } catch {
    return;
  }

  const { userId, epoch } = session;
  const currentEpoch =
    epoch === 0
      ? {
          _id: userId,
          $or: [{ sessionEpoch: 0 }, { sessionEpoch: { $exists: false } }],
        }
      : { _id: userId, sessionEpoch: epoch };

  await UserModel.updateOne(currentEpoch, { $inc: { sessionEpoch: 1 } });
}
