import { z } from 'zod';

/**
 * The contract's three failure reasons map onto `LoginFailureReason` in the
 * frontend's auth types, and the login screen already renders a distinct message
 * for each. They must stay distinct here.
 */
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username.').max(40),
  password: z.string().min(1, 'Enter your password.').max(200),
  /**
   * Optional. The login form sends the role the user picked from a dropdown, so
   * a mismatch has its own message rather than being silently ignored.
   */
  role: z.enum(['admin', 'kasir']).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * A user changing their own password.
 *
 * `currentPassword` is mandatory and verified first: an unlocked shared desk is
 * the main practical threat here, so the endpoint must not trust possession of
 * the session cookie alone. The strength floor matches the users module —
 * different floors in different places means the weak one is the real one.
 */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Enter your current password.')
    .max(200),
  newPassword: z
    .string()
    .min(6, 'Password must be at least 6 characters.')
    .max(200),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
