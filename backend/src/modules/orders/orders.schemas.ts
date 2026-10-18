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
      email: z.string().trim().max(200).default(''),
    })
    .nullable()
    .optional(),
});

export const orderQuery = z.object({
  cashierId: objectId.optional(),
  /** Inclusive calendar days, resolved in the store's timezone. */
  from: dayString.optional(),
  to: dayString.optional(),
});

export const recentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(8),
});

export type CreateOrderInput = z.infer<typeof createOrderInput>;
export type OrderQuery = z.infer<typeof orderQuery>;
