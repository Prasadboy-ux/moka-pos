import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Request validation.
 *
 * Handlers never read `req.body` / `req.query` / `req.params` directly. They read
 * the parsed values via `parsed()` / `routeId()`. That distinction matters for
 * query strings: everything in `req.query` arrives as a string, so
 * `req.query.includeInactive === false` is never true. The schemas coerce it,
 * and a handler reading `parsed(req).query.includeInactive` gets a real boolean.
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

declare global {
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
 * The parsed, coerced request parts, typed as the handler declares them.
 *
 * This is the only supported way for a handler to read input. Reaching for
 * `req.validated?.body` instead means casting away an `undefined` that would then
 * crash three lines later — and a handler reached without `validate()` mounted
 * is a wiring bug, not a client error, so it throws a plain `Error` naming the
 * route rather than a 422 blaming the caller.
 */
export function parsed<B = unknown, Q = unknown, P = unknown>(
  req: Request,
): { body: B; query: Q; params: P } {
  if (!req.validated) {
    throw new Error(
      'A handler read validated input but validate() is not mounted on its route.',
    );
  }
  return req.validated as { body: B; query: Q; params: P };
}

/** The validated `:id` path parameter. */
export function routeId(req: Request): string {
  return parsed<unknown, unknown, { id: string }>(req).params.id;
}
