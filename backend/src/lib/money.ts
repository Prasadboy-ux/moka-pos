/**
 * Money, tax, and the one text normalisation the receipt link depends on.
 *
 * Kept in one file so "how do we round" has a single answer. If tax rounding
 * lived in the order service and value rounding in the stock service, they would
 * drift, and a receipt that does not add up is worse than a crash.
 */

/** Rounds to whole rupiah. Cash has no sub-unit in practice. */
export function roundIDR(value: number): number {
  return Math.round(value);
}

/**
 * Indonesian VAT, rounded to whole rupiah.
 *
 * `subtotal * rate` is fractional for most carts — 28,000 at 10% is exactly
 * 2,800, but 24,000 at 10% is 2,400 and a 37,500 cart gives 3,750 — so the
 * rounding must be specified rather than incidental. Half-up via `Math.round`
 * matches the frontend exactly.
 */
export function calculateTax(subtotal: number, rate: number): number {
  return roundIDR(subtotal * rate);
}

/**
 * Reduces a typed phone number to the digits a `wa.me` link needs.
 *
 * Indonesian numbers are the awkward case: `+62 812-3456-7890`,
 * `0812-3456-7890` and `81234567890` are the same person, and a link built from
 * the first opens nobody's chat. Returns `null` when the number is unusable, so
 * a customer object that cannot be acted on is never stored.
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 0) return null;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  // A bare national number with no trunk prefix.
  if (digits.length >= 9 && digits.length <= 11) return `62${digits}`;

  return null;
}
