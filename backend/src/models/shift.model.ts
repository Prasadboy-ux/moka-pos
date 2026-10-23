import { Schema, model } from 'mongoose';
import { toApiJson } from './shared.js';

/**
 * Cash shifts. A shift gates selling (`POST /api/orders` refuses without one)
 * and closing it reconciles the drawer.
 *
 * The three reconciliation fields are stored at close time, not derived on
 * read: they are what the drawer was judged against when it was counted, and a
 * later edit to order history must not rewrite yesterday's variance.
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
    /** Cash takings inside this shift. Null while open. */
    cashSales: { type: Number, default: null },
    /** openingFloat + cashSales. Null while open. */
    expectedCash: { type: Number, default: null },
    /** counted − expected. Negative is short. Null while open. */
    variance: { type: Number, default: null },
  },
  { toJSON: toApiJson, collection: 'shifts' },
);

// A user can have at most one open shift. The partial index makes that a
// database rule, not a check-then-insert race two concurrent taps can slip past.
shiftSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);

export type Shift = {
  _id: unknown;
  userId: unknown;
  userName: string;
  openedAt: Date;
  openingFloat: number;
  closedAt: Date | null;
  closingCounted: number | null;
  status: 'open' | 'closed';
  cashSales: number | null;
  expectedCash: number | null;
  variance: number | null;
};

export const ShiftModel = model('Shift', shiftSchema);
