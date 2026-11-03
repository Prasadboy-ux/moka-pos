import { ApiError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { verifySession } from '../../lib/session.js';
import {
  type SessionUser,
  findByUsername,
  toSessionUser,
  UserModel,
} from '../../models/user.model.js';
import type { ChangePasswordInput, LoginInput } from './auth.schemas.js';

export type AuthenticatedSession = {
  user: SessionUser;
  sessionEpoch: number;
};

/**
 * Authenticates a staff account.
 *
 * The three refusals the contract specifies are kept distinct because the login
 * screen already branches on them:
 *
 *   invalid       — unknown username, or the password was wrong
 *   inactive      — the account has been deactivated
 *   role-mismatch — the form said `admin`, the account says `kasir`
 *
 * Order matters for security. The password is verified *before* `isActive` is
 * reported, so an attacker cannot discover which usernames exist, or whether
 * they are active, without already knowing the password.
 */

export async function authenticate(
  input: LoginInput,
): Promise<AuthenticatedSession> {
  const user = await findByUsername(input.username).select('+passwordHash');

  // Identical status and message for "no such user" and "wrong password", so a
  // wrong username cannot be distinguished from a wrong password by timing the
  // response or reading the reason.
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
      `You are signed in as a ${user.role}. Please pick ${user.role} and try again.`,
      'role-mismatch',
    );
  }

  return {
    user: toSessionUser(user),
    sessionEpoch: user.sessionEpoch ?? 0,
  };
}

function invalidCredentials(): ApiError {
  return ApiError.unauthenticated(
    'That username and password do not match an account.',
    'invalid',
  );
}

/**
 * Stands in for a real password verification when there is no user to compare
 * against.
 *
 * Without it, a missing username returns noticeably faster than a wrong
 * password, and the response time alone enumerates valid usernames.
 */
async function burnTime(): Promise<void> {
  await verifyPassword(
    'no-such-user-placeholder',
    'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA',
  );
}

/**
 * Lets signed-in users rotate their own password.
 *
 * The current password is verified first, because a session cookie is held open
 * on shared desks — possessing it must not be enough to take over the account.
 *
 * Every session is then revoked by bumping `sessionEpoch`. A password change is
 * the moment a user expects other devices to be signed out: if a cookie was
 * copied from an unlocked till, changing the password is how they take the
 * account back. The caller therefore has to sign in again with the new password.
 *
 * A reused password is refused. Users reuse old passwords reflexively, and the
 * whole point of the current-password check is that the account's past
 * passwords are not equivalent credentials.
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
    throw ApiError.validation('The new password must be different from the current one.', {
      newPassword: 'The new password must be different from the current one.',
    });
  }

  user.passwordHash = await hashPassword(input.newPassword);
  user.sessionEpoch = (user.sessionEpoch ?? 0) + 1;
  await user.save();
}

/**
 * Revokes every session belonging to the token's account.
 *
 * Logout cannot delete a stateless JWT, so it bumps the epoch instead. The
 * epoch is only bumped when the presented token is still current: otherwise a
 * copied old token could be replayed as a logout and keep signing the real user
 * out after they had already rotated their password.
 *
 * An invalid, expired, or stale token is a no-op. Logout must always clear the
 * cookie, even when there is nothing left on the server to revoke.
 */
export async function revokeSessionsForToken(token: string): Promise<void> {
  let session: Awaited<ReturnType<typeof verifySession>>;
  try {
    session = await verifySession(token);
  } catch {
    return;
  }

  const { userId, epoch } = session;
  // Accounts created before `sessionEpoch` existed have no field; treat that
  // as zero so their first logout still revokes the token they are holding.
  const currentEpoch =
    epoch === 0
      ? {
          _id: userId,
          $or: [
            { sessionEpoch: 0 },
            { sessionEpoch: { $exists: false } },
          ],
        }
      : { _id: userId, sessionEpoch: epoch };

  await UserModel.updateOne(currentEpoch, { $inc: { sessionEpoch: 1 } });
}
