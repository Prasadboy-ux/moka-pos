import { ApiError } from '../../lib/errors.js';
import { verifyPassword } from '../../lib/password.js';
import {
  type SessionUser,
  findByUsername,
  toSessionUser,
} from '../../models/user.model.js';
import type { LoginInput } from './auth.schemas.js';

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

export async function authenticate(input: LoginInput): Promise<SessionUser> {
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

  return toSessionUser(user);
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
