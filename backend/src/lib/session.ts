import type { CookieOptions } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';

/**
 * Session cookies & token management.
 *
 * Uses httpOnly, SameSite=lax cookie holding a signed Jose JWT (HS256).
 * Supports standard shift sessions (default 12 hours) and extended Remember Me
 * sessions (30 days).
 *
 * Intermediate MFA challenge tokens (5 min TTL) and setup tokens (10 min TTL)
 * ensure two-step authentication flows remain stateless and cryptographically verified.
 */

export const SESSION_COOKIE = 'moka_session';

const SESSION_ISSUER = 'moka-pos';
const SESSION_AUDIENCE = 'moka-pos-web';
const REMEMBER_ME_DAYS = 30;

let cachedKey: Uint8Array | undefined;

function signingKey(): Uint8Array {
  cachedKey ??= new TextEncoder().encode(env().SESSION_SECRET);
  return cachedKey;
}

/**
 * Signs a full session JWT.
 * When `rememberMe` is true, session duration is extended to 30 days.
 */
export async function signSession(
  userId: string,
  sessionEpoch: number,
  rememberMe = false,
): Promise<string> {
  const { SESSION_TTL_HOURS } = env();
  const expiration = rememberMe ? `${REMEMBER_ME_DAYS * 24}h` : `${SESSION_TTL_HOURS}h`;

  return new SignJWT({ epoch: sessionEpoch, rememberMe })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(signingKey());
}

export type VerifiedSession = {
  userId: string;
  epoch: number;
};

/**
 * Returns the user id and epoch from a session cookie, or throws 401.
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
 * Signs a short-lived (5 min) challenge token when credentials are valid
 * but the account requires MFA verification before receiving the session cookie.
 */
export async function signMfaChallengeToken(
  userId: string,
  sessionEpoch: number,
  rememberMe = false,
): Promise<string> {
  return new SignJWT({
    epoch: sessionEpoch,
    purpose: 'mfa_challenge',
    rememberMe,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(signingKey());
}

export async function verifyMfaChallengeToken(
  token: string,
): Promise<{ userId: string; epoch: number; rememberMe: boolean }> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ['HS256'],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    if (
      payload.purpose !== 'mfa_challenge' ||
      typeof payload.sub !== 'string' ||
      typeof payload.epoch !== 'number'
    ) {
      throw new Error('Invalid token purpose');
    }

    return {
      userId: payload.sub,
      epoch: payload.epoch,
      rememberMe: Boolean(payload.rememberMe),
    };
  } catch {
    throw ApiError.unauthenticated(
      'MFA challenge has expired or is invalid. Please sign in again.',
    );
  }
}

/**
 * Signs a short-lived (10 min) setup token for newly mandatory MFA setup.
 */
export async function signMfaSetupToken(
  userId: string,
  sessionEpoch: number,
  secret: string,
  rememberMe = false,
): Promise<string> {
  return new SignJWT({
    epoch: sessionEpoch,
    secret,
    purpose: 'mfa_setup',
    rememberMe,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(signingKey());
}

export async function verifyMfaSetupToken(
  token: string,
): Promise<{ userId: string; epoch: number; secret: string; rememberMe: boolean }> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ['HS256'],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    if (
      payload.purpose !== 'mfa_setup' ||
      typeof payload.sub !== 'string' ||
      typeof payload.epoch !== 'number' ||
      typeof payload.secret !== 'string'
    ) {
      throw new Error('Invalid setup token');
    }

    return {
      userId: payload.sub,
      epoch: payload.epoch,
      secret: payload.secret,
      rememberMe: Boolean(payload.rememberMe),
    };
  } catch {
    throw ApiError.unauthenticated(
      'MFA setup session expired. Please sign in again to continue setup.',
    );
  }
}

/**
 * Generates cookie options matching the session duration (30 days if rememberMe, else SESSION_TTL_HOURS).
 */
export function sessionCookieOptions(rememberMe = false): CookieOptions {
  const { COOKIE_SECURE, SESSION_TTL_HOURS } = env();

  const maxAge = rememberMe
    ? REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000
    : SESSION_TTL_HOURS * 60 * 60 * 1000;

  return {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}
