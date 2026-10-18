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

export const adjustInput = z.object({
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
  /** Signed: negative consumes. Must not be zero — a no-op is a mistake. */
  qty: z
    .number({ message: 'A quantity is required.' })
    .refine((value) => value !== 0, 'Quantity cannot be zero.'),
  note: z.string().trim().max(240).default(''),
});

export type MovementFilter = z.infer<typeof movementFilter>;
export type LevelQuery = z.infer<typeof levelQuery>;
export type AdjustInput = z.infer<typeof adjustInput>;
