/**
 * A key that identifies one checkout attempt, so a retry cannot charge twice.
 *
 * It has to outlive a failed request: the cashier sees "connection lost", taps
 * Complete sale again, and that second POST must resolve to the receipt the
 * first one may already have created. Generating the key inside the repository
 * per HTTP call made every retry a brand-new sale.
 */
export function newIdempotencyKey(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `pos-${Date.now().toString(36)}-${random}`;
}

/**
 * One cart's checkout attempt, kept by the POS screen rather than the dialog so
 * closing and reopening the dialog does not mint a second key. Per-dialog state
 * was enough while a lost response left the dialog open, but Escape or the
 * close button could still remount it, and the retry then looked like a new
 * sale to the API.
 */
export interface CheckoutKey {
  signature: string;
  key: string;
}

/**
 * What is being sold, not how it is paid for: switching from cash to QRIS while
 * retrying the same cart is still the same sale. `|` cannot appear in a Mongo
 * id, so two different carts cannot collide on the same fingerprint.
 */
export function checkoutSignature(
  lines: ReadonlyArray<{ productId: string; qty: number }>,
): string {
  return lines
    .map((line) => `${line.productId}:${line.qty}`)
    .join("|");
}

/** Reuses the key while the cart is unchanged; a changed cart is a new sale. */
export function reuseCheckoutKey(
  current: CheckoutKey | null,
  signature: string,
): CheckoutKey {
  if (current?.signature === signature) return current;
  return { signature, key: newIdempotencyKey() };
}
