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
