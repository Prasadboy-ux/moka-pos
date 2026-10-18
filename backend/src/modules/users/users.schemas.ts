import { z } from 'zod';
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

const password = z
  .string()
  .min(6, 'Password must be at least 6 characters.')
  .max(200)
  .optional();

export const userInput = z.object({
  name: displayName,
  username,
  role: z.enum(['admin', 'kasir']),
  isActive: z.boolean().default(true),
  /** Required on create; absent or empty on update means "leave it alone". */
  password,
});

/** Create-time variant, where the password is not optional. */
export const createUserInput = userInput.extend({
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters.')
    .max(200),
});

export const setActiveInput = z.object({ isActive: z.boolean() });

export type UserInput = z.infer<typeof userInput>;
export type CreateUserInput = z.infer<typeof createUserInput>;
