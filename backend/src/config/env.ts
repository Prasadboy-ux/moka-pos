import { z } from 'zod';

/**
 * Environment parsing.
 *
 * Parsed lazily rather than at import time so that a missing variable produces
 * one clear message at the moment it is actually needed, instead of an
 * unresolvable import error from whichever module happened to import first.
 * Tests also get a chance to set the environment before anything reads it.
 */

const baseSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  /**
   * 3001, not 3000: Next.js dev already binds 3000 and the two run side by side
   * during development.
   */
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required. See .env.example.'),

  /**
   * Server selection timeout for MongoDB connections. Keep bounded so health
   * probes and cold starts fail fast instead of hanging on a bad URI or outage.
   */
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),

  /**
   * Connection pool limits. On serverless (Vercel) prefer a small max pool and
   * `minPoolSize` 0 to avoid exhausting Atlas connections across instances.
   */
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(10),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).default(0),
  MONGODB_MAX_IDLE_TIME_MS: z.coerce.number().int().min(0).default(30_000),

  /**
   * Mongoose autoIndex builds indexes from schemas on connect. Useful in local
   * dev; disable in production/serverless and manage indexes explicitly.
   * Defaults to true outside production.
   */
  MONGODB_AUTO_INDEX: z.stringbool().optional(),

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
   * Express `trust proxy` setting. Unset means "no proxy": the socket address
   * is the client address, and `X-Forwarded-For` is ignored. Set to 1 when
   * exactly one proxy (Vercel, nginx) sits in front, or to a subnet/CIDR list.
   * Never set 1 on a directly reachable server — clients could spoof the header
   * and evade per-IP rate limits.
   */
  TRUST_PROXY: z.string().optional(),

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
   * Failed sign-ins allowed per username per 15 minutes, regardless of source
   * address. Successful sign-ins do not consume this budget.
   */
  RATE_LIMIT_LOGIN_USERNAME_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(20),

  /** Password-change attempts allowed per user+IP per 15 minutes. */
  RATE_LIMIT_PASSWORD_MAX: z.coerce.number().int().positive().default(10),

  /**
   * Requests allowed per IP per minute across the whole API. A backstop
   * against runaway clients, set far above what a real shop generates.
   */
  RATE_LIMIT_API_MAX: z.coerce.number().int().positive().default(2000),

  /**
   * MFA verification attempts allowed per IP+token window. Covers TOTP and
   * single-use backup code verification for login/setup confirmation.
   */
  RATE_LIMIT_MFA_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_MFA_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  /**
   * Force the limiters on under NODE_ENV=test so one suite can exercise the
   * 429 path against the shared store. Never set this on a real deployment:
   * there it is ignored, because the limiters are always on outside tests.
   */
  RATE_LIMIT_TEST_ENABLED: z.stringbool().default(false),

  /**
   * Require admin accounts without MFA to enrol at sign-in. Defaults on outside
   * tests. The smoke stack sets it to false because its fixtures sign in with
   * seeded demo admins; the dedicated MFA end-to-end suite sets it to true.
   * Production cannot disable it.
   */
  MFA_ENFORCE_ADMIN: z.stringbool().optional(),
});

/** The shipped example secret, plus the obvious hand-written stand-ins. */
const PLACEHOLDER_SESSION_SECRET =
  /^(change-me|replace-me|your[-_ ]?secret|secret|test-only)/i;

/**
 * A production session cookie without `Secure` can travel over plain HTTP.
 * Refusing to start is louder than a silent downgrade. The same applies to a
 * copied example secret: 32 characters of `change-me` still signs cookies.
 */
const schema = baseSchema.superRefine((settings, ctx) => {
  if (settings.NODE_ENV === 'production' && !settings.COOKIE_SECURE) {
    ctx.addIssue({
      code: 'custom',
      path: ['COOKIE_SECURE'],
      message:
        'COOKIE_SECURE must be true in production; session cookies must not travel over plain HTTP.',
    });
  }

  if (
    settings.NODE_ENV === 'production' &&
    settings.CORS_ORIGIN.split(',').some((origin) => origin.trim() === '*')
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['CORS_ORIGIN'],
      message:
        "CORS_ORIGIN must list explicit origins in production; '*' would let any site call the API with the user's cookie.",
    });
  }

  if (
    settings.NODE_ENV === 'production' &&
    settings.MFA_ENFORCE_ADMIN === false
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['MFA_ENFORCE_ADMIN'],
      message: 'MFA_ENFORCE_ADMIN cannot be disabled in production.',
    });
  }

  if (
    settings.NODE_ENV === 'production' &&
    PLACEHOLDER_SESSION_SECRET.test(settings.SESSION_SECRET)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['SESSION_SECRET'],
      message:
        'SESSION_SECRET is still a placeholder. Generate a unique value with `openssl rand -hex 32`.',
    });
  }

  // `Intl` is the only IANA database the process actually uses to bucket days.
  // A typo here would otherwise surface as a runtime failure on the first sale.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: settings.STORE_TIMEZONE });
  } catch {
    ctx.addIssue({
      code: 'custom',
      path: ['STORE_TIMEZONE'],
      message:
        'STORE_TIMEZONE must be an IANA timezone name, for example Asia/Jakarta.',
    });
  }
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

/**
 * Admin MFA is required at sign-in unless explicitly disabled. It defaults on
 * outside tests so demo accounts and the smoke fixtures stay usable; production
 * cannot turn it off at all (enforced by the schema above).
 */
export function adminMfaEnforced(): boolean {
  const settings = env();
  return settings.MFA_ENFORCE_ADMIN ?? settings.NODE_ENV !== 'test';
}

export function mongoAutoIndex(): boolean {
  const settings = env();
  return settings.MONGODB_AUTO_INDEX ?? settings.NODE_ENV !== 'production';
}

export function corsOrigins(): string[] {
  return env()
    .CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Express `trust proxy` value.
 *
 * The default is `false`, not `1`: on a server that is reachable directly,
 * trusting the first `X-Forwarded-For` hop lets any client choose its own
 * apparent IP and walk around every per-IP limiter. Vercel is the one platform
 * this app ships to that always has a proxy, so it is auto-detected; anywhere
 * else the operator sets `TRUST_PROXY` explicitly.
 */
export function trustProxySetting(): boolean | number | string {
  const raw = env().TRUST_PROXY?.trim();
  if (!raw) {
    return process.env.VERCEL ? 1 : false;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  const hops = Number(raw);
  if (Number.isInteger(hops) && hops >= 0) return hops;

  // Express also accepts names like `loopback` and comma-separated subnet
  // lists; passing those through keeps the setting useful behind a known
  // proxy without pretending to validate Express's whole grammar here.
  return raw;
}
