import { Schema, model } from 'mongoose';

/**
 * Receipt number sequence. Internal — never returned by an endpoint.
 *
 * Allocated with `findOneAndUpdate` + `$inc` inside the order's transaction, so
 * two concurrent sales cannot be handed the same number. The unique index on
 * `orders.receiptNo` is the backstop if this is ever misused.
 */
const counterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { collection: 'counters', versionKey: false },
);

export const CounterModel = model('Counter', counterSchema);
