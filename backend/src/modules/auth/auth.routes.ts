import { Router, type Request, type Response } from 'express';
import { loginLimiter } from '../../lib/rate-limit.js';
import { validate } from '../../lib/validate.js';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from '../../lib/session.js';
import { requireSession, sessionUser } from '../../middleware/session.js';
import { loginSchema, type LoginInput } from './auth.schemas.js';
import { authenticate } from './auth.service.js';

export const router: Router = Router();

router.post(
  '/auth/login',
  loginLimiter(),
  validate({ body: loginSchema }),
  login,
);
router.post('/auth/logout', logout);
router.get('/auth/me', requireSession, me);

async function login(req: Request, res: Response): Promise<void> {
  const input = req.validated?.body as LoginInput;

  const user = await authenticate(input);
  const token = await signSession(user.id);

  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.status(200).json({ user });
}

/**
 * Clears the cookie and nothing else.
 *
 * There is no session table, so a token stays valid until it expires even after
 * logout. That is the usual trade for stateless cookies, and it is acceptable
 * here because the token is re-validated against the user document on every
 * request — a deactivated account cannot use a leaked token at all.
 */
function logout(_req: Request, res: Response): void {
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
