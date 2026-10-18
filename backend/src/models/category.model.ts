import { Schema, model } from 'mongoose';
import { toApiJson } from './shared.js';

/**
 * Product groupings. `sortOrder` is the display order the POS grid and every
 * filter use, which is why it is a stored field rather than something sorted on
 * read.
 */
const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    sortOrder: { type: Number, required: true, default: 0 },
  },
  { toJSON: toApiJson, collection: 'categories' },
);

export type Category = {
  _id: unknown;
  name: string;
  sortOrder: number;
};

export const CategoryModel = model('Category', categorySchema);
