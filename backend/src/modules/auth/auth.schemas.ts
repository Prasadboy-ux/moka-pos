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
