import { ApiError } from '../../lib/errors.js';
import { CategoryModel } from '../../models/category.model.js';
import { ProductModel } from '../../models/product.model.js';
import { NAME_COLLATION } from '../../models/shared.js';
import type {
  CategoryInput,
  CategoryPatch,
  ReorderInput,
} from './categories.schemas.js';

/**
 * Display order first, then name. `sortOrder` is the order the POS grid and every
 * filter use, so it outranks the alphabet; the name tiebreak keeps the order
 * stable when two categories share a sortOrder.
 */
export async function listCategories() {
  return CategoryModel.find()
    .sort({ sortOrder: 1, name: 1 })
    .collation(NAME_COLLATION);
}

export async function createCategory(input: CategoryInput) {
  // New categories land at the end of the display order unless the caller said
  // otherwise.
  let sortOrder = input.sortOrder;

  if (sortOrder === undefined) {
    const highest = await CategoryModel.findOne().sort({ sortOrder: -1 });
    sortOrder = (highest?.sortOrder ?? 0) + 1;
  }

  return CategoryModel.create({ name: input.name, sortOrder });
}

export async function updateCategory(id: string, input: CategoryPatch) {
  const category = await CategoryModel.findById(id);
  if (!category) throw ApiError.notFound('That category no longer exists.');

  // Assigned conditionally so an omitted sortOrder leaves the position alone.
  if (input.name !== undefined) category.name = input.name;
  if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;

  await category.save();
  return category;
}

export async function removeCategory(id: string): Promise<void> {
  const category = await CategoryModel.findById(id);
  if (!category) throw ApiError.notFound('That category no longer exists.');

  /**
   * Refused rather than cascaded. Deleting a category with products in it would
   * either orphan them or delete them silently, and neither is recoverable from
   * the UI. The client disables the button too, but the server is what has to
   * enforce it — the button is a convenience, not a control.
   */
  const inUse = await ProductModel.exists({ categoryId: category._id });
  if (inUse) {
    throw ApiError.conflict(
      'category-in-use',
      'Move or archive the products in this category first.',
    );
  }

  await CategoryModel.deleteOne({ _id: category._id });
}

export async function reorderCategories(input: ReorderInput) {
  /**
   * Ids that do not match are skipped rather than rejected, and categories left
   * out of the list keep their current position. That matches how the reorder
   * dialog submits — the full visible order, not a diff — so a stale tab cannot
   * fail the whole drag with a 404 about a category deleted two minutes ago.
   */
  await Promise.all(
    input.ids.map((id, index) =>
      CategoryModel.updateOne({ _id: id }, { $set: { sortOrder: index + 1 } }),
    ),
  );

  return listCategories();
}
