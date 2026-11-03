import { z } from 'zod';

/**
 * The minimum length for every password this API accepts or sets.
 *
 * Twelve rather than eight: eight-character passwords are cheap to brute-force
 * offline once a hash leaks, and staff accounts are created by hand, so the
 * length cost is paid once per account rather than once per shift.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Passwords that appear at the top of every credential-stuffing list, plus the
 * seeded demo credentials. Refusing these is not a substitute for a breach
 * corpus, but it stops the two most likely choices on a POS deployment.
 */
const COMMON_PASSWORDS = new Set(
  [
    'admin123',
    'kasir123',
    'password',
    'password123',
    '12345678',
    '123456789',
    '1234567890',
    'qwerty',
    'qwerty123',
    'letmein',
    'welcome',
    'abc123',
    'iloveyou',
    'monkey',
    'dragon',
    'football',
    'baseball',
    'sunshine',
    'princess',
    'master',
    'shadow',
    'superman',
    'mokapos',
    'moka-pos',
    'kopi123',
    'rahasia',
    'indonesia',
  ].map((password) => password.toLowerCase()),
);

/**
 * Shared by user creation, user update, and self-service password changes.
 *
 * A single schema is deliberate: different floors in different places means the
 * weakest one is the real policy.
 */
export const strongPassword = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  )
  .max(200)
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message:
      'That password is too common. Choose something less predictable.',
  });
