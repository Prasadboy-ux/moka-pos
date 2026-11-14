import type { Request } from 'express';
import {
  ipKeyGenerator,
  rateLimit,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
import { env } from '../config/env.js';
import { mongoRateLimitStore } from './rate-limit-store.js';

/**
 * Request rate limiting.
 *
 * Limiters:
 *   - The login limiter bounds credential stuffing.
 *   - The per-username login limiter stops distributed attacks on one account.
 *   - The password-change limiter prevents guessing current passwords.
 *   - The MFA limiter stops brute-force guessing of 6-digit one-time codes.
 *   - The API limiter is a backstop against runaway client polling.
 */

export function limitersEnabled(): boolean {
  const settings = env();
  if (settings.NODE_ENV === 'test') {
    return settings.RATE_LIMIT_TEST_ENABLED;
  }
  return true;
}

/** Envelope the frontend already understands — mirrors ApiError's shape. */
const limitedBody = {
  error: 'rate_limited' as const,
  message: 'Too many requests. Please wait a moment and try again.',
};

export function loginLimiter(): RateLimitRequestHandler {
  const windowMs = 15 * 60 * 1000;
  return rateLimit({
    windowMs,
    limit: env().RATE_LIMIT_LOGIN_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !limitersEnabled(),
    store: mongoRateLimitStore('login:', windowMs),
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        message: 'Too many sign-in attempts. Please wait and try again.',
      });
    },
  });
}

/**
 * Failed sign-ins for one username, across every source address.
 */
export function loginUsernameLimiter(): RateLimitRequestHandler {
  const windowMs = 15 * 60 * 1000;
  return rateLimit({
    windowMs,
    limit: env().RATE_LIMIT_LOGIN_USERNAME_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: () => !limitersEnabled(),
    store: mongoRateLimitStore('login-user:', windowMs),
    keyGenerator: (req: Request) => {
      const raw = (req.body as { username?: unknown } | undefined)?.username;
      const username = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      return username
        ? `user:${username}`
        : `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
    },
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        message:
          'Too many sign-in attempts for this account. Please wait and try again.',
      });
    },
  });
}

/**
 * Verification attempts for MFA TOTP codes and single-use backup codes.
 *
 * Strict default (5 attempts per 15 minutes) prevents brute-forcing 6-digit
 * passcodes. Tunable via env for operational needs.
 */
export function mfaLimiter(): RateLimitRequestHandler {
  const windowMs = env().RATE_LIMIT_MFA_WINDOW_MINUTES * 60 * 1000;
  return rateLimit({
    windowMs,
    limit: env().RATE_LIMIT_MFA_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !limitersEnabled(),
    store: mongoRateLimitStore('mfa:', windowMs),
    keyGenerator: (req: Request) => {
      const body = req.body as
        { mfaToken?: unknown; setupToken?: unknown } | undefined;
      const token = (
        typeof body?.mfaToken === 'string'
          ? body.mfaToken
          : typeof body?.setupToken === 'string'
            ? body.setupToken
            : ''
      ).slice(-16);
      return `mfa:${ipKeyGenerator(req.ip ?? 'unknown')}:${token || 'none'}`;
    },
    handler: (_req, res) => {
      const minutes = env().RATE_LIMIT_MFA_WINDOW_MINUTES;
      res.status(429).json({
        error: 'rate_limited',
        message: `Too many invalid verification attempts. Please wait ${minutes} minutes before trying again.`,
      });
    },
  });
}

/**
 * Current-password guesses from a signed-in session.
 */
export function passwordLimiter(): RateLimitRequestHandler {
  const windowMs = 15 * 60 * 1000;
  return rateLimit({
    windowMs,
    limit: env().RATE_LIMIT_PASSWORD_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !limitersEnabled(),
    store: mongoRateLimitStore('password:', windowMs),
    keyGenerator: (req: Request) => {
      const userId = req.session?.user.id ?? 'anonymous';
      return `${userId}:${ipKeyGenerator(req.ip ?? 'unknown')}`;
    },
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        message:
          'Too many password-change attempts. Please wait and try again.',
      });
    },
  });
}

export function apiLimiter(): RateLimitRequestHandler {
  const windowMs = 60 * 1000;
  return rateLimit({
    windowMs,
    limit: env().RATE_LIMIT_API_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !limitersEnabled(),
    store: mongoRateLimitStore('api:', windowMs),
    handler: (_req, res) => {
      res.status(429).json(limitedBody);
    },
  });
}
