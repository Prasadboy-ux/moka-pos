import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Request validation.
 *
 * Handlers never read `req.body` / `req.query` / `req.params` directly. They
 * read `req.validated`, which holds *parsed and coerced* values. That distinction
 * matters for query strings: everything in `req.query` arrives as a string, so
 * `req.query.includeInactive === false` is never true. The schemas below coerce
 * it, and a handler reading `req.validated.query.includeInactive` gets a real
 * boolean.
 *
 * A failed parse throws a `ZodError`, which the error middleware renders as a
 * 422 with per-field messages. Handlers therefore never contain validation
 * branches at all.
 */

export type RequestSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export type Validated<B = unknown, Q = unknown, P = unknown> = Request<
  P,
  unknown,
  B,
  Q
>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      validated?: { body: unknown; query: unknown; params: unknown };
    }
  }
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.validated = {
      body: schemas.body ? schemas.body.parse(req.body) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
}

/**
 * Narrows the request for a handler that declares the schemas it was mounted
 * with. Throws if `validate` did not run, which is a wiring bug rather than a
 * client error, so it is a programming error rather than an `ApiError`.
 */
export function validated<B, Q, P>(req: Request): Validated<B, Q, P> {
  if (!req.validated) {
    throw new Error(
      'Request reached a handler without passing through validate(). Mount it on the route.',
    );
  }
  return req as Validated<B, Q, P>;
}
