/**
 * The single error vocabulary the API speaks.
 *
 * Every non-2xx response in this service is one of the shapes below. The
 * frontend reads `error` to branch and `message` to show the user, so `message`
 * must always be a sentence with a next step where one exists. See
 * frontend/docs/API-CONTRACT.md section 1.
 */

export const CONFLICT_REASONS = [
  'last-active-admin',
  'category-in-use',
  'already-open-shift',
  'already-closed-shift',
  'shift-closed',
  'no-open-shift',
  'username-taken',
  'order-already-voided',
  'idempotency-key-foreign',
  'duplicate',
] as const;

export type ConflictReason = (typeof CONFLICT_REASONS)[number];

/**
 * The refusals `POST /api/auth/login` and MFA challenge distinguish.
 */
export const AUTH_FAILURE_REASONS = [
  'invalid',
  'inactive',
  'role-mismatch',
  'invalid_mfa',
] as const;

export type AuthFailureReason = (typeof AUTH_FAILURE_REASONS)[number];

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'conflict'
  | 'insufficient-stock'
  | 'rate_limited'
  | 'internal';

export type ApiErrorBody = {
  error: ApiErrorCode;
  message: string;
  reason?: ConflictReason | AuthFailureReason;
  fields?: Record<string, string>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  static unauthenticated(
    message = 'Your session has ended. Please sign in again.',
    reason?: AuthFailureReason,
  ): ApiError {
    return new ApiError(401, {
      error: 'unauthenticated',
      ...(reason ? { reason } : {}),
      message,
    });
  }

  static forbidden(
    message = 'Your account does not have access to this action.',
    reason?: AuthFailureReason,
  ): ApiError {
    return new ApiError(403, {
      error: 'forbidden',
      ...(reason ? { reason } : {}),
      message,
    });
  }

  static notFound(message = 'That record no longer exists.'): ApiError {
    return new ApiError(404, { error: 'not-found', message });
  }

  static validation(
    message = 'Some of the details sent were not valid.',
    fields?: Record<string, string>,
  ): ApiError {
    return new ApiError(422, {
      error: 'validation',
      message,
      ...(fields ? { fields } : {}),
    });
  }

  /**
   * The generic duplicate-key fallback answers `duplicate` because it fires
   * before the service layer can tell which unique index was hit. Services
   * usually pass a more specific reason.
   */
  static conflict(
    reason: ConflictReason | undefined,
    message: string,
  ): ApiError {
    return new ApiError(409, {
      error: 'conflict',
      ...(reason ? { reason } : {}),
      message,
    });
  }

  static insufficientStock(message: string): ApiError {
    return new ApiError(409, { error: 'insufficient-stock', message });
  }

  static internal(
    message = 'An unexpected internal error occurred. Please try again.',
  ): ApiError {
    return new ApiError(500, { error: 'internal', message });
  }
}
