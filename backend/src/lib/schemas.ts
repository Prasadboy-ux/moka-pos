import { z } from 'zod';
import { isDayString } from './dates.js';

/**
 * Schema primitives shared across modules.
 *
 * Money and quantity live here rather than in each module because getting them
 * subtly wrong is how a POS loses money quietly: one float in one route and the
 * receipt no longer adds up.
 */

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Ids are opaque 24-character hex. Validated at the edge so a bad id produces a
 * 422 with a clear message instead of a Mongo `CastError` surfacing as a 500.
 */
export const objectId = z
  .string()
  .regex(OBJECT_ID_PATTERN, 'That is not a valid id.');

export const idParam = z.object({ id: objectId });

/**
 * Integer rupiah. No floats, ever — `12_000.00` and `12000.5` are both rejected,
 * because a price that cannot be represented exactly cannot be added up
 * reliably.
 */
export const rupiah = z
  .number({ message: 'A price is required.' })
  .int('Money must be a whole number of rupiah — no decimals.')
  .min(0, 'Amount cannot be negative.');

export const quantity = z
  .number({ message: 'A quantity is required.' })
  .positive('Quantity must be greater than zero.');

export const nonNegativeNumber = z
  .number()
  .min(0, 'Amount cannot be negative.');

/**
 * A fraction: 0.1 for 10% VAT. Clamped to 0..1 because a tax rate above 1 is
 * always a units mistake — rupiah entered where a fraction was expected.
 */
export const rate = z.number().min(0).max(1);

export const displayName = z
  .string({ message: 'A name is required.' })
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(120, 'Name must be 120 characters or fewer.');

/**
 * A real calendar day in `yyyy-mm-dd` form.
 *
 * The regex alone would accept `2026-02-31`, which `Date` silently rolls into
 * March and a report would then quietly span the wrong month.
 */
export const dayString = z
  .string()
  .refine(isDayString, 'Dates must be a real day in yyyy-mm-dd form.');

/**
 * A boolean that survives the query string.
 *
 * `?includeInactive=false` arrives as the four-character string `"false"`, which
 * is truthy. `z.coerce.boolean()` makes this *worse* rather than better — it
 * applies JavaScript's `Boolean(value)`, so `"false"` becomes `true` and every
 * inactive product appears in the POS grid. Only the affirmative spellings count.
 *
 * Absent and empty both mean false, which is the safe reading for a filter that
 * controls visibility.
 */
export const queryBoolean = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

/**
 * Escapes a user-supplied string before it becomes a Mongo `$regex`.
 *
 * Without this, a search for `.*` matches everything and a search for
 * `(a+)+b` is a denial-of-service vector. The caller still decides what to search
 * for; this only guarantees the metacharacters are inert.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
