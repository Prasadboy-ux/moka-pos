/**
 * MongoDB's duplicate-key error.
 *
 * Callers turn a specific unique index into their own conflict response: a
 * second open shift, a reused receipt number, or an idempotent replay.
 */
export function isDuplicateKey(error: unknown): boolean {
  return error instanceof Error && (error as { code?: unknown }).code === 11000;
}
