import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../lib/errors.js';
import { SESSION_COOKIE, verifySession } from '../lib/session.js';
import {
  type Role,
  type SessionUser,
  UserModel,
  toSessionUser,
} from '../models/user.model.js';

declare global {
  namespace Express {
    interface Request {
      session?: { user: SessionUser };
    }
  }
}

/**
 * Requires a valid session, and attaches the user to the request.
 *
 * The user document is re-read on every request rather than trusted from the
 * token. The token carries only an id, so a role change or a deactivation takes
 * effect on the very next call instead of at token expiry — a staff account
 * fired at closing time has to stop working immediately, not in twelve hours.
 *
 * Throws rather than calling `next(error)`: Express 5 forwards a rejected promise
 * from async middleware to the error handler on its own.
 */
export const requireSession: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    throw ApiError.unauthenticated(
      'You are not signed in. Please sign in to continue.',
    );
  }

  const userId = await verifySession(token);

  const user = await UserModel.findById(userId);
  if (!user) {
    throw ApiError.unauthenticated('Your account no longer exists.');
  }
  if (!user.isActive) {
    throw ApiError.unauthenticated(
      'This account has been deactivated. Ask an administrator to restore it.',
    );
  }

  req.session = { user: toSessionUser(user) };
  next();
};

/**
 * Role check for a route. Must be mounted after `requireSession`.
 *
 * The client hides nav links a role may not use; this is the check that
 * actually matters. Hiding a link is presentation, not authorisation.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.session?.user;
    if (!user) {
      throw ApiError.unauthenticated();
    }
    if (!allowed.includes(user.role)) {
      throw ApiError.forbidden(
        `This action is limited to ${allowed.join(' or ')} accounts. You are signed in as ${user.role}.`,
      );
    }
    next();
  };
}

/**
 * The session user, or a thrown 401.
 *
 * For handlers mounted behind `requireSession`, where its absence would be a
 * wiring bug rather than a client problem.
 */
export function sessionUser(req: Request): SessionUser {
  const user = req.session?.user;
  if (!user) throw ApiError.unauthenticated();
  return user;
}
