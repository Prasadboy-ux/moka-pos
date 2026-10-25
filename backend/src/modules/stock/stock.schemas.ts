import { z } from 'zod';
import { objectId } from '../../lib/schemas.js';

export const movementFilter = z.object({
  type: z.enum(['sale', 'void', 'purchase', 'adjustment', 'waste']).optional(),
  ingredientId: objectId.optional(),
  productId: objectId.optional(),
  /**
   * The ledger grows with every sale, so a list without page bounds would
   * ship the whole trading history to every screen load. 200 newest by
   * default; callers page deeper with `offset`.
   */
  limit: z.coerce
    .number({ error: 'limit must be a number.' })
    .int('limit must be a whole number.')
    .min(1, 'limit must be at least 1.')
    .max(1000, 'limit cannot exceed 1000.')
    .default(200),
  offset: z.coerce
    .number({ error: 'offset must be a number.' })
    .int('offset must be a whole number.')
    .min(0, 'offset cannot be negative.')
    .max(10_000, 'Use an ingredient or type filter instead of paging this deep.')
    .optional(),
});

export const levelQuery = z.object({
  target: z.enum(['ingredient', 'product']),
  targetId: objectId,
});

export const adjustInput = z
  .object({
    target: z.enum(['ingredient', 'product']),
    targetId: objectId,
    /**
     * `sale` is absent by design. Sales write their movements as part of
     * `POST /api/orders` inside the same transaction, so a manual sale here would
     * produce a ledger entry no receipt accounts for. `void` is likewise off
     * limits — it is written only by `POST /api/orders/:id/void`, so each void
     * movement stays traceable to its receipt's `Voided … — reason` note.
     */
    type: z.enum(['purchase', 'waste', 'adjustment'], {
      message: 'Type must be purchase, waste, or adjustment.',
    }),
    /**
     * Signed: negative consumes. The sign has to agree with the reason, or a
     * "purchase" can quietly remove stock and the ledger reads the opposite of
     * what happened. A correction may point either way, but never nowhere.
     *
     * Whole pcs only: stock is counted in cups and packets, and a fractional
     * adjustment would let the level drift to 10.5 pcs that no ledger movement
     * of an on-sale decrement can ever explain.
     */
    qty: z
      .number({ message: 'A quantity is required.' })
      .int('Quantity must be a whole number.'),
    note: z.string().trim().max(240).default(''),
  })
  .superRefine((input, ctx) => {
    if (input.qty === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['qty'],
        message: 'Quantity cannot be zero.',
      });
      return;
    }

    if (input.type === 'purchase' && input.qty < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['qty'],
        message: 'A purchase must add stock; enter a positive quantity.',
      });
    }

    if (input.type === 'waste' && input.qty > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['qty'],
        message: 'Waste must remove stock; enter a negative quantity.',
      });
    }
  });

export type MovementFilter = z.infer<typeof movementFilter>;
export type LevelQuery = z.infer<typeof levelQuery>;
export type AdjustInput = z.infer<typeof adjustInput>;
