import { Schema, model } from 'mongoose';
import { toApiJson } from './shared.js';

/**
 * Cash-shift records. Nothing gates on these in v1 — closing stores a counted
 * float and no code compares it against cash sales inside the shift. Cash
 * reconciliation is explicitly out of scope in the API contract.
 */
const shiftSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    openedAt: { type: Date, default: Date.now, required: true },
    openingFloat: { type: Number, required: true, min: 0 },
    closedAt: { type: Date, default: null },
    closingCounted: { type: Number, default: null },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
      required: true,
    },
  },
  { toJSON: toApiJson, collection: 'shifts' },
);

// Supports "does this user have a shift open?" and "list this user's shifts".
shiftSchema.index({ userId: 1, status: 1 });

export type Shift = {
  _id: unknown;
  userId: unknown;
  userName: string;
  openedAt: Date;
  openingFloat: number;
  closedAt: Date | null;
  closingCounted: number | null;
  status: 'open' | 'closed';
};

export const ShiftModel = model('Shift', shiftSchema);
