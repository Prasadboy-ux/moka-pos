import { ApiError } from '../../lib/errors.js';
import { IngredientModel } from '../../models/ingredient.model.js';
import { NAME_COLLATION } from '../../models/shared.js';
import type { IngredientInput } from './ingredients.schemas.js';

/**
 * Ingredients are listed alphabetically because this is a picker, not a ledger
 * — staff are looking for one item by name, not reading a sequence.
 */
export async function listIngredients() {
  return IngredientModel.find().sort({ name: 1 }).collation(NAME_COLLATION);
}

export async function getIngredient(id: string) {
  const ingredient = await IngredientModel.findById(id);
  if (!ingredient) throw ApiError.notFound('That ingredient no longer exists.');
  return ingredient;
}

export async function createIngredient(input: IngredientInput) {
  return IngredientModel.create({
    name: input.name,
    unit: input.unit,
    minStock: input.minStock,
    costPerUnit: input.costPerUnit,
    // Always zero on create. See the schema note.
    stock: 0,
  });
}

/**
 * Updates the ingredient record only.
 *
 * `stock` is never in the body and never written here — the whole point of the
 * ledger is that there is exactly one path that changes a level, and this is not
 * it. A rename is always safe because the id it references does not change, so
 * recipe rows cannot be orphaned.
 */
export async function updateIngredient(id: string, input: IngredientInput) {
  const ingredient = await IngredientModel.findById(id);
  if (!ingredient) throw ApiError.notFound('That ingredient no longer exists.');

  ingredient.name = input.name;
  ingredient.unit = input.unit;
  ingredient.minStock = input.minStock;
  ingredient.costPerUnit = input.costPerUnit;

  await ingredient.save();
  return ingredient;
}
