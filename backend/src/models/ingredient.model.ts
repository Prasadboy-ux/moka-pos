import { Schema, model } from 'mongoose';
import { toApiJson } from './shared.js';

/**
 * Raw stock. An ingredient is the thing a recipe consumes, and it holds the
 * current level directly.
 *
 * `costPerUnit` is rupiah for ONE unit — a 250 g bag at Rp 95,000 is `380` per
 * gram. This is the single easiest field in the schema to get wrong: storing a
 * per-bag price here makes every margin read as a multiple of the real one.
 *
 * `minStock` is a low-stock alert, never a sales block. An ingredient below its
 * minimum can still be sold; the stock screen shows a warning and that is all.
 *
 * There is no delete. Removing an ingredient would orphan recipe rows. It leaves
 * the menu by being dropped from recipes.
 */
const ingredientSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    unit: { type: String, enum: ['gram', 'ml', 'pcs'], required: true },
    stock: { type: Number, required: true, default: 0, min: 0 },
    minStock: { type: Number, required: true, default: 0, min: 0 },
    costPerUnit: { type: Number, required: true, min: 0 },
  },
  { toJSON: toApiJson, collection: 'ingredients' },
);

export type Ingredient = {
  _id: unknown;
  name: string;
  unit: 'gram' | 'ml' | 'pcs';
  stock: number;
  minStock: number;
  costPerUnit: number;
};

export const IngredientModel = model('Ingredient', ingredientSchema);
