import { z } from 'zod';
import { dayString, objectId, quantity, rupiah } from '../../lib/schemas.js';

export const orderLineInput = z.object({
  productId: objectId,
  qty: quantity,
});

/**
 * The whole sale as the client sends it.
 *
 * Note what is *absent*: `subtotal`, `taxAmount`, `total`, `changeAmount` and
 * `cashier`. All of them are recomputed server-side, and `cashier` comes from
 * the session — a body that claims otherwise is ignored rather than rejected, so
 * a stale client cannot fail a sale over a field it no longer needs to send.
 */
export const createOrderInput = z.object({
  lines: z.array(orderLineInput).min(1, 'Add at least one item to the cart.'),
  paymentMethod: z.enum(['cash', 'qris', 'debit', 'credit']),
  paidAmount: rupiah,
  customer: z
    .object({
      name: z.string().trim().max(120).default(''),
      phone: z.string().trim().max(40).default(''),
      // The checkout form sends `null` for an empty email rather than `""`, so
      // the schema accepts both and the service collapses them to one shape.
      email: z.string().trim().max(200).nullish().default(''),
    })
    .nullable()
    .optional(),
});

export const orderQuery = z.object({
  cashierId: objectId.optional(),
  /** Inclusive calendar days, resolved in the store's timezone. */
  from: dayString.optional(),
  to: dayString.optional(),
  /**
   * Voided receipts stay listable for audit. When omitted, a list answers with
   * everything so the transaction screen can still show what was reversed -
   * reports exclude voided sales themselves rather than relying on callers.
   */
  status: z.enum(['paid', 'voided']).optional(),
  /**
   * The customer-facing way to name a sale is how a customer quotes it back:
   * receipt number, who they were, or the phone of theirs on the receipt.
   * Searched case-insensitively as a substring.
   */
  q: z
    .string()
    .trim()
    .max(40, 'Keep the search under 40 characters.')
    .optional(),
  method: z.enum(['cash', 'qris', 'debit', 'credit']).optional(),
  /**
   * Server-side page bounds. Without them a growing day book would ship the
   * whole trading history to every screen that peeked at it.
   */
  limit: z.coerce
    .number({ error: 'limit must be a number.' })
    .int('limit must be a whole number.')
    .min(1, 'limit must be at least 1.')
    .max(100, 'limit cannot exceed 100.')
    .optional(),
  offset: z.coerce
    .number({ error: 'offset must be a number.' })
    .int('offset must be a whole number.')
    .min(0, 'offset cannot be negative.')
    .max(10_000, 'Use a narrower date range instead of paging this deep.')
    .optional(),
});

/**
 * A void has to say why. A reason shorter than what a manager would type into a
 * shift-close note is not a reason; the field enforces a sentence, not a tap.
 */
export const voidOrderInput = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Write a short reason so the reversal can be audited.')
    .max(240),
});

export const recentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(8),
});

export type CreateOrderInput = z.infer<typeof createOrderInput>;
export type OrderQuery = z.infer<typeof orderQuery>;
export type VoidOrderInput = z.infer<typeof voidOrderInput>;
