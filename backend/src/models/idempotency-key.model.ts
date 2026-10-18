import { Schema, model } from 'mongoose';

/**
 * `Idempotency-Key` records for `POST /api/orders`. Internal.
 *
 * A till on flaky wifi will retry a checkout. Without this, the retry mints a
 * second receipt and the customer is charged twice — the one failure mode a POS
 * must not have. The client's key is the document `_id`, so the unique index
 * makes a second insert of the same key fail instead of duplicating.
 */
const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

const idempotencyKeySchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    orderId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { collection: 'idempotency_keys', versionKey: false },
);

// Old keys are garbage-collected rather than kept forever; a week is far longer
// than any retry takes.
idempotencyKeySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: IDEMPOTENCY_TTL_SECONDS },
);

export const IdempotencyKeyModel = model(
  'IdempotencyKey',
  idempotencyKeySchema,
);
