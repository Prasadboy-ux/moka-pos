import { z } from 'zod';
import { objectId } from '../../lib/schemas.js';

export const movementFilter = z.object({
  type: z.enum(['sale', 'purchase', 'adjustment', 'waste']).optional(),
  ingredientId: objectId.optional(),
  productId: objectId.optional(),
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
     * produce a ledger entry no receipt accounts for.
     */
    type: z.enum(['purchase', 'waste', 'adjustment'], {
      message: 'Type must be purchase, waste, or adjustment.',
    }),
    /**
     * Signed: negative consumes. The sign has to agree with the reason, or a
     * "purchase" can quietly remove stock and the ledger reads the opposite of
     * what happened. A correction may point either way, but never nowhere.
     */
    qty: z.number({ message: 'A quantity is required.' }),
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
