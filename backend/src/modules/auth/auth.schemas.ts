import { z } from 'zod';
import { strongPassword } from '../../lib/password-policy.js';

/**
 * The contract's failure reasons map onto `LoginFailureReason` in the
 * frontend's auth types.
 */
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username.').max(40),
  password: z.string().min(1, 'Enter your password.').max(200),
  role: z.enum(['admin', 'kasir']).optional(),
  rememberMe: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1, 'MFA challenge token is required.'),
  code: z.string().trim().min(6, 'Verification code is required.').max(20),
});

export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaSetupConfirmSchema = z.object({
  setupToken: z.string().min(1, 'MFA setup token is required.'),
  code: z.string().trim().length(6, '6-digit authenticator code is required.'),
});

export type MfaSetupConfirmInput = z.infer<typeof mfaSetupConfirmSchema>;

/**
 * Regenerating the signed-in user's own recovery codes.
 *
 * Both factors are required: the password proves it is the person at the
 * keyboard, and the current TOTP code proves the authenticator is still in
 * their hands. A stolen session alone must not be able to mint new codes.
 */
export const mfaBackupCodesRegenerateSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Enter your current password.')
    .max(200),
  code: z
    .string()
    .trim()
    .length(6, '6-digit authenticator code is required.'),
});

export type MfaBackupCodesRegenerateInput = z.infer<
  typeof mfaBackupCodesRegenerateSchema
>;

/**
 * A user changing their own password.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: strongPassword,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
