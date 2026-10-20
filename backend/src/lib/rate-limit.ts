import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Request rate limiting.
 *
 * Two limiters, both keyed by client IP:
 *
 *   - The login limiter is the real defence: it bounds credential stuffing,
 *     which is the only attack a coffee-shop POS with one public IP actually
 *     faces from the outside.
 *   - The API limiter is a backstop against a runaway client — an accidental
 *     polling loop or a browser tab stuck in a fetch cycle, the exact class of
 *     bug that burned a day of this project's history. Its default is set far
 *     above what a busy shop of tablets generates so it never fires in normal
 *     use; RATE_LIMIT_API_MAX exists only to lower it, not to raise it past
 *     sane levels.
 *
 * Both are skipped under NODE_ENV=test: the e2e suite signs in and issues
 * hundreds of requests from one address, and a limiter would turn those into
 * flaky 429s. The limits themselves are env-tunable because the smoke suite
 * against a dev server (NODE_ENV=development) also concentrates traffic on one
 * IP and needs headroom the defaults would otherwise lack.
 */

const skipInTests = (): boolean => env().NODE_ENV === 'test';

/** Envelope the frontend already understands — mirrors ApiError's shape. */
const limitedBody = {
  error: 'rate_limited',
  message: 'Too many requests. Please wait a moment and try again.',
};

export function loginLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env().RATE_LIMIT_LOGIN_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skipInTests,
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        message: 'Too many sign-in attempts. Please wait and try again.',
      });
    },
  });
}

export function apiLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: env().RATE_LIMIT_API_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skipInTests,
    handler: (_req, res) => {
      res.status(429).json(limitedBody);
    },
  });
}
