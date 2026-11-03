import { Schema, model } from 'mongoose';
import { toApiJson } from './shared.js';

/**
 * A completed sale.
 *
 * `lines` is embedded and denormalised on purpose. `name`, `price` and
 * `stockMode` are snapshots of what was charged, not references: a later price
 * change or product deletion must not rewrite an old receipt, and a reprint
 * years from now must still match. This is why there is no index on
 * `lines.productId` — lines are never joined.
 *
 * `customer` is not listed in the API contract's suggested shape but the
 * frontend `Order` type requires it (`OrderCustomer | null`) and the checkout
 * dialog sends it, so it is stored and returned.
 */
const orderLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    qty: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: 'Quantity must be a whole number.',
      },
    },
    stockMode: { type: String, enum: ['recipe', 'direct'], required: true },
  },
  { _id: false },
);

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    email: { type: String, default: null },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    receiptNo: { type: String, required: true },
    lines: { type: [orderLineSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'qris', 'debit', 'credit'],
      required: true,
    },
    paidAmount: { type: Number, required: true, min: 0 },
    changeAmount: { type: Number, required: true, min: 0 },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cashierName: { type: String, required: true },
    /**
     * The shift this sale was rung up under. Stamped at sale time and never
     * rewritten — reconciliation counts cash by this field, so a shift closed
     * yesterday still sums exactly the orders it sold. `null` only on history
     * seeded from before shifts gated selling.
     */
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', default: null },
    customer: { type: customerSchema, default: null },
    /**
     * A sale, or a sale reversed. `voided` receipts stay on the record — a
     * mistake that disappeared without trace could never be audited — but every
     * report, summary and cash reconciliation treats them as never sold.
     */
    status: {
      type: String,
      enum: ['paid', 'voided'],
      default: 'paid',
      required: true,
    },
    voidedAt: { type: Date, default: null },
    /** The account id that reversed the sale, kept even if the user is renamed later. */
    voidedBy: { type: String, default: null },
    /** Denormalised at void time so the receipt shows the reversal history even after users change. */
    voidedByName: { type: String, default: null },
    voidReason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { toJSON: toApiJson, collection: 'orders' },
);

// A retried POST /api/orders must never mint a second receipt number.
orderSchema.index({ receiptNo: 1 }, { unique: true });
// The reports range-scan on this.
orderSchema.index({ createdAt: -1 });
orderSchema.index({ cashierId: 1 });
// Closing a shift sums its cash sales by this.
orderSchema.index({ shiftId: 1 });
// Reports and lists exclude or filter voided receipts by this.
orderSchema.index({ status: 1 });

export type OrderLine = {
  productId: unknown;
  name: string;
  price: number;
  qty: number;
  stockMode: 'recipe' | 'direct';
};

export type OrderCustomer = {
  name: string;
  phone: string;
  email: string | null;
};

export type OrderStatus = 'paid' | 'voided';

export type Order = {
  _id: unknown;
  receiptNo: string;
  lines: OrderLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'qris' | 'debit' | 'credit';
  paidAmount: number;
  changeAmount: number;
  cashierId: unknown;
  cashierName: string;
  shiftId: unknown;
  customer: OrderCustomer | null;
  status: OrderStatus;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidedByName: string | null;
  voidReason: string;
  createdAt: Date;
};

export const OrderModel = model('Order', orderSchema);
