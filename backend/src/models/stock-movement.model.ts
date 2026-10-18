import { Schema, model } from 'mongoose';
import { toApiJson } from './shared.js';

/**
 * The stock ledger — an audit trail, never the source of truth.
 *
 * Current levels live on `ingredients.stock` and direct-mode
 * `products.stock`. Reading a level means reading that document, not summing
 * this table, which grows without bound. This table answers "how did the level
 * get here?", not "how much is there?".
 *
 * `label` and `byUserName` are denormalised so a ledger line still reads
 * correctly after the ingredient is renamed or the staff member leaves.
 *
 * `qty` is signed: negative consumes.
 */
const stockMovementSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['sale', 'purchase', 'adjustment', 'waste'],
      required: true,
    },
    ingredientId: {
      type: Schema.Types.ObjectId,
      ref: 'Ingredient',
      default: null,
    },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    label: { type: String, required: true },
    qty: { type: Number, required: true },
    unit: { type: String, enum: ['gram', 'ml', 'pcs'], default: null },
    note: { type: String, default: '', maxlength: 240 },
    createdAt: { type: Date, default: Date.now, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byUserName: { type: String, required: true },
  },
  { toJSON: toApiJson, collection: 'stock_movements' },
);

stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ ingredientId: 1 });
stockMovementSchema.index({ productId: 1 });

export type StockMovement = {
  _id: unknown;
  type: 'sale' | 'purchase' | 'adjustment' | 'waste';
  ingredientId: unknown;
  productId: unknown;
  label: string;
  qty: number;
  unit: 'gram' | 'ml' | 'pcs' | null;
  note: string;
  createdAt: Date;
  byUserId: unknown;
  byUserName: string;
};

export const StockMovementModel = model('StockMovement', stockMovementSchema);
