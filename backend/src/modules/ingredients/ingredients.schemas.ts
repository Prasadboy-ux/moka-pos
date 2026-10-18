import { z } from 'zod';
import { displayName, nonNegativeNumber } from '../../lib/schemas.js';

/**
 * `stock` is deliberately absent. A new ingredient starts at zero and the first
 * stock arrives as a `purchase` movement, so every unit on hand has a ledger
 * entry. Accepting an opening level here would create stock that no movement
 * explains.
 */
export const ingredientInput = z.object({
  name: displayName,
  unit: z.enum(['gram', 'ml', 'pcs'], { message: 'Choose gram, ml, or pcs.' }),
  minStock: nonNegativeNumber,
  /**
   * Rupiah for ONE unit — a single gram, a single millilitre. A 250 g bag at
   * Rp 95,000 is 380, not 95000. Getting this wrong is invisible in the data
   * and catastrophic in the margin.
   */
  costPerUnit: nonNegativeNumber,
});

export type IngredientInput = z.infer<typeof ingredientInput>;
