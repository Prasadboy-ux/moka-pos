import { Router, type Request, type Response } from 'express';
import {
  loginLimiter,
  loginUsernameLimiter,
  mfaLimiter,
  passwordLimiter,
} from '../../lib/rate-limit.js';
import { validate } from '../../lib/validate.js';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from '../../lib/session.js';
import { requireSession, sessionUser } from '../../middleware/session.js';
import {
  changePasswordSchema,
  loginSchema,
  mfaBackupCodesRegenerateSchema,
  mfaSetupConfirmSchema,
  mfaVerifySchema,
  type ChangePasswordInput,
  type LoginInput,
  type MfaBackupCodesRegenerateInput,
  type MfaSetupConfirmInput,
  type MfaVerifyInput,
} from './auth.schemas.js';
import {
  authenticate,
  changePassword,
  confirmMfaSetup,
  getMfaStatus,
  regenerateBackupCodes,
  revokeSessionsForToken,
  verifyMfaLogin,
} from './auth.service.js';

export const router: Router = Router();

router.post(
  '/auth/login',
  loginLimiter(),
  validate({ body: loginSchema }),
  loginUsernameLimiter(),
  login,
);

router.post(
  '/auth/mfa/verify',
  mfaLimiter(),
  validate({ body: mfaVerifySchema }),
  mfaVerifyRoute,
);

router.post(
  '/auth/mfa/setup-confirm',
  mfaLimiter(),
  validate({ body: mfaSetupConfirmSchema }),
  mfaSetupConfirmRoute,
);

router.post('/auth/logout', logout);
router.get('/auth/me', requireSession, me);

/**
 * Security settings for the signed-in account.
 */
router.get('/auth/mfa/status', requireSession, mfaStatusRoute);
router.post(
  '/auth/mfa/backup-codes/regenerate',
  requireSession,
  passwordLimiter(),
  validate({ body: mfaBackupCodesRegenerateSchema }),
  regenerateBackupCodesRoute,
);

/**
 * Any signed-in role may change their own password.
 */
router.post(
  '/auth/change-password',
  requireSession,
  passwordLimiter(),
  validate({ body: changePasswordSchema }),
  changePasswordRoute,
);

async function login(req: Request, res: Response): Promise<void> {
  const input = req.validated?.body as LoginInput;
  const result = await authenticate(input);

  if (result.status === 'mfa_required') {
    res.status(200).json({
      mfaRequired: true,
      mfaToken: result.mfaToken,
      username: result.username,
      backupCodesRemaining: result.backupCodesRemaining,
    });
    return;
  }

  if (result.status === 'mfa_setup_required') {
    res.status(200).json({
      mfaSetupRequired: true,
      setupToken: result.setupToken,
      secret: result.secret,
      qrUri: result.qrUri,
      username: result.username,
    });
    return;
  }

  const token = await signSession(
    result.user.id,
    result.sessionEpoch,
    result.rememberMe,
  );

  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(result.rememberMe));
  res.status(200).json({ user: result.user });
}

async function mfaVerifyRoute(req: Request, res: Response): Promise<void> {
  const input = req.validated?.body as MfaVerifyInput;
  const { user, sessionEpoch, rememberMe } = await verifyMfaLogin(input);

  const token = await signSession(user.id, sessionEpoch, rememberMe);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(rememberMe));
  res.status(200).json({ user });
}

async function mfaSetupConfirmRoute(req: Request, res: Response): Promise<void> {
  const input = req.validated?.body as MfaSetupConfirmInput;
  const { user, sessionEpoch, backupCodes, rememberMe } =
    await confirmMfaSetup(input);

  const token = await signSession(user.id, sessionEpoch, rememberMe);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(rememberMe));
  res.status(200).json({ user, backupCodes });
}

/**
 * Clears the cookie and revokes the token server-side.
 */
async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) {
    await revokeSessionsForToken(token).catch(() => undefined);
  }
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
}

/**
 * Replaces reading the session out of `localStorage`.
 */
function me(req: Request, res: Response): void {
  res.status(200).json({ user: sessionUser(req) });
}

async function mfaStatusRoute(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getMfaStatus(sessionUser(req).id));
}

async function regenerateBackupCodesRoute(
  req: Request,
  res: Response,
): Promise<void> {
  res.status(200).json(
    await regenerateBackupCodes(
      sessionUser(req).id,
      req.validated?.body as MfaBackupCodesRegenerateInput,
    ),
  );
}

/**
 * 204: the password has changed, and there is nothing to hand back.
 */
async function changePasswordRoute(req: Request, res: Response): Promise<void> {
  await changePassword(
    sessionUser(req).id,
    req.validated?.body as ChangePasswordInput,
  );
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
}
