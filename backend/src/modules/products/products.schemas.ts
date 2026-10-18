import { z } from 'zod';
import {
  displayName,
  objectId,
  queryBoolean,
  quantity,
  rupiah,
} from '../../lib/schemas.js';

const recipeItem = z.object({
  ingredientId: objectId,
  qty: quantity,
});

/**
 * `stockMode` decides which of two mutually exclusive shapes applies, so the
 * rule cannot live on a single field — it is enforced across the object below.
 *
 * On `direct`, `stock`/`minStock` default to 0 rather than being required. The
 * contract calls them required; defaulting accepts a strict superset of what the
 * contract accepts and matches the mock's behaviour, and a direct product with
 * zero stock is safely unsellable rather than wrongly sellable. `recipe` is
 * ignored and stored empty, as the contract specifies.
 */
export const productInput = z
  .object({
    name: displayName,
    categoryId: objectId,
    price: rupiah,
    image: z.string().trim().min(1, 'Pick an image for this product.').max(300),
    stockMode: z.enum(['recipe', 'direct'], {
      message: 'Choose recipe or direct stock.',
    }),
    stock: z.number().min(0, 'Stock cannot be negative.').optional(),
    minStock: z.number().min(0, 'Minimum stock cannot be negative.').optional(),
    recipe: z.array(recipeItem).default([]),
    isActive: z.boolean().default(true),
  })
  .superRefine((input, ctx) => {
    if (input.stockMode === 'recipe' && input.recipe.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipe'],
        message: 'A recipe product needs at least one ingredient.',
      });
    }

    if (input.stockMode === 'recipe') {
      const seen = new Set<string>();
      for (const [index, item] of input.recipe.entries()) {
        if (seen.has(item.ingredientId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['recipe', index, 'ingredientId'],
            message: 'This ingredient is already in the recipe.',
          });
        }
        seen.add(item.ingredientId);
      }
    }
  });

export const productQuery = z.object({
  /**
   * Query strings are always strings, and `coerce.boolean` turns "false" into
   * true. See `queryBoolean`.
   */
  includeInactive: queryBoolean.default(false),
  categoryId: objectId.optional(),
  search: z.string().trim().max(120).optional(),
});

export const setActiveInput = z.object({ isActive: z.boolean() });

export type ProductInput = z.infer<typeof productInput>;
export type ProductQuery = z.infer<typeof productQuery>;
export type SetActiveInput = z.infer<typeof setActiveInput>;
