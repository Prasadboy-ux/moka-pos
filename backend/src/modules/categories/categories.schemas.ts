import { z } from 'zod';
import { displayName } from '../../lib/schemas.js';

/**
 * `sortOrder` is optional on create: the service appends to the end of the
 * display order when it is absent, which is what the reorder dialog expects.
 * It is optional on update too, so a rename does not silently move a category.
 */
export const categoryInput = z.object({
  name: displayName,
  sortOrder: z.number().int().min(0).optional(),
});

export const categoryPatch = categoryInput.partial();

export const reorderInput = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Send at least one category id.'),
});

export type CategoryInput = z.infer<typeof categoryInput>;
export type CategoryPatch = z.infer<typeof categoryPatch>;
export type ReorderInput = z.infer<typeof reorderInput>;
