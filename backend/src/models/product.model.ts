import { Schema, model } from 'mongoose';
import { toApiJson } from './shared.js';

/**
 * Sellable items, in one of two modes.
 *
 * `direct` — a counted good. It holds `stock` itself.
 * `recipe` — a drink assembled from ingredients. It holds NO stock of its own;
 * its availability is derived from whether the recipe's ingredients cover it.
 *
 * `stock` and `minStock` are required for `direct` and ignored for `recipe`,
 * where `recipe` is required and must be non-empty. Enforced in the module's
 * validation rather than here, because the rule spans two fields and the error
 * needs to name which one is missing.
 */
const recipeItemSchema = new Schema(
  {
    ingredientId: {
      type: Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
    },
    qty: { type: Number, required: true, min: 0.001 },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, required: true, trim: true },
    stockMode: { type: String, enum: ['recipe', 'direct'], required: true },
    stock: { type: Number, min: 0 },
    minStock: { type: Number, min: 0 },
    recipe: { type: [recipeItemSchema], default: [] },
    isActive: { type: Boolean, default: true, required: true },
  },
  { toJSON: toApiJson, collection: 'products' },
);

productSchema.index({ categoryId: 1 });
productSchema.index({ isActive: 1 });

export type RecipeItem = { ingredientId: unknown; qty: number };

export type Product = {
  _id: unknown;
  name: string;
  categoryId: unknown;
  price: number;
  image: string;
  stockMode: 'recipe' | 'direct';
  stock?: number;
  minStock?: number;
  recipe: RecipeItem[];
  isActive: boolean;
};

export const ProductModel = model('Product', productSchema);
