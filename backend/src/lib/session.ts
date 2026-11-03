import type { CookieOptions } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';

/**
 * Session cookies.
 *
 * The contract recommends a cookie over a bearer token, and the reason is
 * concrete: a token in `localStorage` is readable by any script on the page, so
 * one XSS becomes a permanent account takeover. An httpOnly cookie is invisible
 * to JavaScript and goes away when the cookie jar does.
 *
 * The token carries only the user id. Role and active status are re-read from
 * the database on every request, so deactivating an account takes effect
 * immediately instead of whenever the token happens to expire.
 */

export const SESSION_COOKIE = 'moka_session';

/** Pinned so a token minted for another service can never be replayed here. */
const SESSION_ISSUER = 'moka-pos';
const SESSION_AUDIENCE = 'moka-pos-web';

let cachedKey: Uint8Array | undefined;

function signingKey(): Uint8Array {
  cachedKey ??= new TextEncoder().encode(env().SESSION_SECRET);
  return cachedKey;
}

/**
 * The epoch is the account's `sessionEpoch` at issue time. `requireSession`
 * compares it with the database value, which is what makes a password change or
 * sign-out revoke tokens that are otherwise still cryptographically valid.
 */
export async function signSession(
  userId: string,
  sessionEpoch: number,
): Promise<string> {
  const { SESSION_TTL_HOURS } = env();

  return new SignJWT({ epoch: sessionEpoch })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(signingKey());
}

export type VerifiedSession = {
  userId: string;
  epoch: number;
};

/**
 * Returns the user id and epoch, or throws a 401.
 *
 * `algorithms` is pinned rather than taken from the token header: without it an
 * attacker could present `alg: none` or swap in an asymmetric algorithm and
 * have the signature step quietly skipped.
 *
 * Every jose failure — bad signature, wrong shape, expired, tampered — is
 * converted to the same 401. They are one situation from the caller's point of
 * view, and letting a jose error escape would surface as a 500, which both
 * misreports the cause and tells an attacker they produced a structurally valid
 * token rather than an invalid one.
 */
export async function verifySession(token: string): Promise<VerifiedSession> {
  let subject: unknown;
  let epoch: unknown;
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ['HS256'],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    subject = payload.sub;
    epoch = payload.epoch;
  } catch {
    throw ApiError.unauthenticated(
      'Your session is no longer valid. Please sign in again.',
    );
  }

  if (
    typeof subject !== 'string' ||
    subject.length === 0 ||
    typeof epoch !== 'number' ||
    !Number.isInteger(epoch) ||
    epoch < 0
  ) {
    throw ApiError.unauthenticated(
      'Your session is no longer valid. Please sign in again.',
    );
  }
  return { userId: subject, epoch };
}

/**
 * `sameSite: 'lax'` rather than `'none'`.
 *
 * `none` requires `secure`, which in turn requires HTTPS, so `none` makes local
 * development over plain `http://localhost` fail in a way that looks like login
 * simply not working. `lax` is sufficient here because the frontend and this API
 * are always *same-site* — different ports on localhost, or `app.` and `api.`
 * under one domain — and only differ in origin, which is CORS's problem rather
 * than SameSite's.
 *
 * If the two are ever deployed on genuinely different sites, this becomes
 * `'none'` plus HTTPS plus a credentialed CORS allow-list.
 */
export function sessionCookieOptions(): CookieOptions {
  const { COOKIE_SECURE, SESSION_TTL_HOURS } = env();

  return {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000,
  };
}
