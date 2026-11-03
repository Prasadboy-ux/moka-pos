import { z } from 'zod';
import { strongPassword } from '../../lib/password-policy.js';
import { displayName } from '../../lib/schemas.js';

/**
 * Usernames are stored as typed but compared case-insensitively, so the
 * character set is restricted to what will not need escaping or look ambiguous.
 * The same rule the frontend form enforces.
 */
const username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(40)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'Use letters, numbers, dots, dashes, or underscores only.',
  );

const userBase = z.object({
  name: displayName,
  username,
  role: z.enum(['admin', 'kasir']),
});

/**
 * Update input. `isActive` is required by the contract: an omitted flag must
 * not silently reactivate a deactivated account. The frontend sends it on every
 * save, so this only tightens hand-written API calls.
 */
export const userInput = userBase.extend({
  isActive: z.boolean(),
  /** Absent or empty means "leave the existing password alone". */
  password: z.union([strongPassword, z.literal('')]).optional(),
});

/** Create-time variant, where the password is not optional. */
export const createUserInput = userBase.extend({
  isActive: z.boolean().default(true),
  password: strongPassword,
});

export const setActiveInput = z.object({ isActive: z.boolean() });

export type UserInput = z.infer<typeof userInput>;
export type CreateUserInput = z.infer<typeof createUserInput>;
