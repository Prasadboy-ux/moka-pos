import { z } from 'zod';

/**
 * Environment parsing.
 *
 * Parsed lazily rather than at import time so that a missing variable produces
 * one clear message at the moment it is actually needed, instead of an
 * unresolvable import error from whichever module happened to import first.
 * Tests also get a chance to set the environment before anything reads it.
 */

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  /**
   * 3001, not 3000: Next.js dev already binds 3000 and the two run side by side
   * during development.
   */
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required. See .env.example.'),

  /** Signing key for the session cookie. 32 chars is a floor, not a suggestion. */
  SESSION_SECRET: z
    .string()
    .min(
      32,
      'SESSION_SECRET must be at least 32 characters. Generate one with `openssl rand -hex 32`.',
    ),

  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  /**
   * True when served over HTTPS. Leave false for plain local HTTP, otherwise the
   * browser drops the session cookie and login silently stops working.
   */
  COOKIE_SECURE: z.stringbool().default(false),

  /**
   * The shop's wall-clock timezone. `from`/`to` report ranges and "today" are
   * resolved in this zone, not the server's, or a day of sales silently shifts
   * across midnight UTC.
   */
  STORE_TIMEZONE: z.string().default('Asia/Jakarta'),

  /** Indonesian VAT. 0.1 = 10%. Matches TAX_RATE_DEFAULT in the frontend. */
  TAX_RATE_DEFAULT: z.coerce.number().min(0).max(1).default(0.1),

  /**
   * Pino level. Not part of the schema: the logger must survive a missing or
   * nonsense env without taking the process down, so it reads process.env
   * directly and falls back on its own.
   */

  /**
   * Login attempts allowed per IP per 15 minutes. 30 bounds credential
   * stuffing while leaving a busy shift (and the smoke suite) headroom.
   */
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(30),

  /**
   * Requests allowed per IP per minute across the whole API. A backstop
   * against runaway clients, set far above what a real shop generates.
   */
  RATE_LIMIT_API_MAX: z.coerce.number().int().positive().default(2000),

  /**
   * Force the limiters on under NODE_ENV=test so one suite can exercise the
   * 429 path against the shared store. Never set this on a real deployment:
   * there it is ignored, because the limiters are always on outside tests.
   */
  RATE_LIMIT_TEST_ENABLED: z.stringbool().default(false),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

/** Test-only: forces the next `env()` call to re-read `process.env`. */
export function resetEnv(): void {
  cached = undefined;
}

export function corsOrigins(): string[] {
  return env()
    .CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
