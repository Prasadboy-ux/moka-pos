import { Router, type Request, type Response } from 'express';
import {
  loginLimiter,
  loginUsernameLimiter,
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
  type ChangePasswordInput,
  type LoginInput,
} from './auth.schemas.js';
import {
  authenticate,
  changePassword,
  revokeSessionsForToken,
} from './auth.service.js';

export const router: Router = Router();

router.post(
  '/auth/login',
  loginLimiter(),
  validate({ body: loginSchema }),
  loginUsernameLimiter(),
  login,
);
router.post('/auth/logout', logout);
router.get('/auth/me', requireSession, me);

/**
 * Any signed-in role may change their own password, and every account should be
 * able to: handing this to admins only would mean "cashiers cannot fix the
 * password their manager just reset in front of them".
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

  const { user, sessionEpoch } = await authenticate(input);
  const token = await signSession(user.id, sessionEpoch);

  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.status(200).json({ user });
}

/**
 * Clears the cookie and revokes the token server-side.
 *
 * A stateless JWT cannot be deleted, so the account's epoch is bumped. That
 * signs out every device for the account, not just this one — the price of
 * having no session table. Revocation is best-effort: a database failure must
 * not leave the browser holding a cookie it asked to be rid of.
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
 * Replaces reading the session out of `localStorage`. Called once on app load;
 * every route guard waits on it, which is why the mock had a `hydrated` flag.
 */
function me(req: Request, res: Response): void {
  res.status(200).json({ user: sessionUser(req) });
}

/**
 * 204: the password has changed, and there is nothing to hand back. The
 * service has bumped the account's session epoch, so this cookie is already
 * dead; clearing it here saves the browser one guaranteed 401.
 */
async function changePasswordRoute(req: Request, res: Response): Promise<void> {
  await changePassword(
    sessionUser(req).id,
    req.validated?.body as ChangePasswordInput,
  );
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
}
