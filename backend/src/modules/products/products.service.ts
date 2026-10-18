import { Types } from 'mongoose';
import { ApiError } from '../../lib/errors.js';
import { escapeRegExp } from '../../lib/schemas.js';
import { CategoryModel } from '../../models/category.model.js';
import { IngredientModel } from '../../models/ingredient.model.js';
import { ProductModel } from '../../models/product.model.js';
import { NAME_COLLATION } from '../../models/shared.js';
import type {
  ProductInput,
  ProductQuery,
  SetActiveInput,
} from './products.schemas.js';

export async function listProducts(query: ProductQuery) {
  const filter: Record<string, unknown> = {};

  // Inactive products are hidden by default. The POS grid must never offer a
  // drink the shop has taken off the menu, and the stock screen asks for them
  // explicitly when it needs to.
  if (!query.includeInactive) filter.isActive = true;
  if (query.categoryId)
    filter.categoryId = new Types.ObjectId(query.categoryId);

  if (query.search) {
    // Escaped, so a search for `.*` is a literal search and not a match-all.
    filter.name = { $regex: escapeRegExp(query.search), $options: 'i' };
  }

  return ProductModel.find(filter).sort({ name: 1 }).collation(NAME_COLLATION);
}

export async function getProduct(id: string) {
  const product = await ProductModel.findById(id);
  if (!product) throw ApiError.notFound('That product no longer exists.');
  return product;
}

export async function createProduct(input: ProductInput) {
  await assertCategoryExists(input.categoryId);
  await assertRecipeIngredientsExist(input);

  const created = await ProductModel.create(normalise(input));
  return created;
}

export async function updateProduct(id: string, input: ProductInput) {
  const product = await ProductModel.findById(id);
  if (!product) throw ApiError.notFound('That product no longer exists.');

  await assertCategoryExists(input.categoryId);
  await assertRecipeIngredientsExist(input);

  // Replaced wholesale rather than merged: switching stockMode has to clear the
  // fields that no longer apply, or a product that was counted would keep a
  // stale stock level next to a recipe it no longer uses.
  product.set(normalise(input));
  await product.save();

  return product;
}

/**
 * `PATCH /products/:id/active` is separate from `DELETE` on purpose.
 *
 * `setActive` is the reversible "we are not selling this today" state and
 * `DELETE` is the terminal one. They are not the same action, and the UI offers
 * them as two separate items, so they stay two separate routes.
 */
export async function setProductActive(id: string, input: SetActiveInput) {
  const product = await ProductModel.findById(id);
  if (!product) throw ApiError.notFound('That product no longer exists.');

  product.isActive = input.isActive;
  await product.save();
  return product;
}

/**
 * A hard delete, which is safe because order lines denormalise name, price and
 * stockMode as sold. A receipt for a deleted product still prints what was
 * actually charged, and a reprint years from now still matches.
 *
 * Stock movements keep their denormalised `label` for the same reason.
 */
export async function removeProduct(id: string): Promise<void> {
  const result = await ProductModel.deleteOne({ _id: id });
  if (result.deletedCount === 0) {
    throw ApiError.notFound('That product no longer exists.');
  }
}

/**
 * Projects the input onto the fields that belong to the chosen stock mode, so a
 * product never carries a stock level it does not use or an empty recipe it does.
 */
function normalise(input: ProductInput) {
  const base = {
    name: input.name,
    categoryId: new Types.ObjectId(input.categoryId),
    price: input.price,
    image: input.image,
    stockMode: input.stockMode,
    isActive: input.isActive,
  };

  if (input.stockMode === 'direct') {
    return {
      ...base,
      stock: input.stock ?? 0,
      minStock: input.minStock ?? 0,
      // A direct product has no recipe. Any supplied rows are discarded rather
      // than stored and silently ignored, which would read as data loss later.
      recipe: [],
    };
  }

  return {
    ...base,
    recipe: input.recipe.map((item) => ({
      ingredientId: new Types.ObjectId(item.ingredientId),
      qty: item.qty,
    })),
  };
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const exists = await CategoryModel.exists({
    _id: new Types.ObjectId(categoryId),
  });
  if (!exists) {
    throw ApiError.validation('That category no longer exists.', {
      categoryId: 'Choose a category that still exists.',
    });
  }
}

/**
 * Checked up front rather than relying on `ref` integrity, which MongoDB does
 * not enforce. A recipe pointing at a missing ingredient would make the product
 * unsellable in a way nothing surfaces until a customer tries to order it.
 */
async function assertRecipeIngredientsExist(
  input: ProductInput,
): Promise<void> {
  if (input.stockMode !== 'recipe' || input.recipe.length === 0) return;

  const ids = input.recipe.map((item) => new Types.ObjectId(item.ingredientId));
  const found = await IngredientModel.countDocuments({ _id: { $in: ids } });

  if (found !== new Set(ids.map(String)).size) {
    throw ApiError.validation(
      'Some ingredients in this recipe no longer exist.',
      {
        recipe: 'Remove ingredients that have been deleted, then save again.',
      },
    );
  }
}
