import type { NextFunction, Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import { ZodError } from 'zod';
import { ApiError } from './errors.js';

/**
 * Translates anything thrown anywhere in the request pipeline into the one
 * error envelope. Mount this last.
 *
 * Express 5 forwards rejected promises from async handlers here automatically,
 * so a route handler does not need a try/catch wrapper — `throw` is enough.
 */

/**
 * Duplicate key — MongoDB's `E11000`, raised when a unique index rejects a
 * write. Checked structurally rather than with `instanceof` so it does not
 * depend on Mongoose's class layout.
 */
function isDuplicateKey(error: unknown): boolean {
  return error instanceof Error && (error as { code?: unknown }).code === 11000;
}

/** body-parser's "you sent me JSON that does not parse". */
function isBodyParseError(
  error: unknown,
): error is { type: string; status: number } {
  return (
    error instanceof Error &&
    'type' in error &&
    (error as { type?: unknown }).type === 'entity.parse.failed'
  );
}

function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    // First message per field wins; later ones are usually consequences.
    fields[key] ??= issue.message;
  }
  return fields;
}

function mongooseFields(
  error: MongooseError.ValidationError,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [path, detail] of Object.entries(error.errors)) {
    fields[path] = detail.message;
  }
  return fields;
}

export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(ApiError.notFound(`No API route matches ${req.method} ${req.path}.`));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // The connection dropped mid-response. Nothing useful to send.
  if (res.headersSent) {
    next(error);
    return;
  }

  const resolved = toApiError(error);

  if (resolved.status >= 500) {
    // 5xx means we are the ones who are wrong. Log it properly; the client
    // gets a generic sentence so internals never leak.
    console.error('[unhandled]', error);
    res.status(500).json({
      error: 'internal',
      message: 'Something went wrong on our side. Please try again.',
    } satisfies { error: 'internal'; message: string });
    return;
  }

  res.status(resolved.status).json(resolved.body);
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.validation(
      'Some of the details sent were not valid.',
      zodFields(error),
    );
  }

  if (error instanceof MongooseError.ValidationError) {
    return ApiError.validation(
      'Some of the details sent were not valid.',
      mongooseFields(error),
    );
  }

  if (error instanceof MongooseError.CastError) {
    return ApiError.validation('Some of the details sent were not valid.', {
      [error.path]: `\`${error.value}\` is not a valid ${error.kind === 'ObjectId' ? 'id' : error.path}.`,
    });
  }

  if (isDuplicateKey(error)) {
    return ApiError.conflict(
      undefined,
      'That value is already taken. Please choose a different one.',
    );
  }

  if (isBodyParseError(error)) {
    return ApiError.validation('The request body was not valid JSON.');
  }

  const status = (error as { status?: unknown; statusCode?: unknown } | null)
    ?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new ApiError(status, {
      error: 'validation',
      message:
        (error as Error).message || 'The request could not be processed.',
    });
  }

  return new ApiError(500, {
    error: 'internal',
    message: 'Something went wrong on our side. Please try again.',
  });
}
