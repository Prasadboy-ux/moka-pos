import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { env } from '../config/env.js';
import { mongoRateLimitStore } from './rate-limit-store.js';

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
 * Both back onto the shared Mongo store rather than one Map per process: on the
 * serverless entry a per-process counter resets with every cold start, and
 * "bucket-stuffing bounded by 30 per 15 minutes" decays into "30 per isolate",
 * which is not a bound at all. The store's counters are namespaced per limiter,
 * so the two windows never merge even though they share the collection.
 *
 * Both are skipped under NODE_ENV=test: the e2e suite signs in and issues
 * hundreds of requests from one address, and a limiter would turn those into
 * flaky 429s. A suite that actually wants to exercise the 429 path sets
 * RATE_LIMIT_TEST_ENABLED=true. Real deployments default the limiters on.
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
