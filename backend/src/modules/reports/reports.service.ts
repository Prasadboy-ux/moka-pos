import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { dayKey, dayRange, monthKey } from '../../lib/dates.js';
import { ApiError } from '../../lib/errors.js';
import { escapeRegExp } from '../../lib/schemas.js';
import { CategoryModel } from '../../models/category.model.js';
import { OrderModel } from '../../models/order.model.js';
import { ProductModel } from '../../models/product.model.js';
import {
  type CategorySalesRow,
  type CashierSalesRow,
  type ProductSalesRow,
  type ReportQuery,
  type SalesReport,
  type TrendPoint,
} from './reports.schemas.js';

/**
 * Server-side aggregation for the reports screen and the dashboard strip.
 *
 * This is the service the old client-side read models looked like: the same
 * arithmetic (proportional gross-revenue allocation, zero-filled trend periods,
 * an "Uncategorised" bucket for lines whose product is gone) moved next to the
 * data so screens stop shipping whole trading histories over the wire. When a
 * figure here disagrees with a figure the old client computed, this file wins —
 * the API is the authority the receipt was charged against.
 */

/** The parts of an order document the report actually reads. */
type ReportOrder = {
  createdAt: Date;
  total: number;
  paymentMethod: 'cash' | 'qris' | 'debit' | 'credit';
  cashierId: Types.ObjectId;
  cashierName: string;
  customer: { phone: string } | null;
  lines: {
    productId: Types.ObjectId;
    name: string;
    price: number;
    qty: number;
  }[];
};

/**
 * Splits an order's gross total across its lines in proportion to their
 * pre-tax weight, then hands leftover rupiah to the largest fractional shares
 * so the breakdown sums back to the order total exactly — no lost or invented
 * cents. Receipts are charged on `total`; lines only know pre-tax prices, so
 * naive per-line sums understate every category and product row by the tax.
 */
export function allocateGrossRevenue(
  lines: { price: number; qty: number }[],
  total: number,
): number[] {
  const weights = lines.map((line) => line.price * line.qty);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  if (weightTotal <= 0 || total <= 0) return lines.map(() => 0);

  const exact = weights.map((weight) => (weight / weightTotal) * total);
  const allocated = exact.map(Math.floor);
  let remaining = total - allocated.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; remaining > 0; i += 1, remaining -= 1) {
    allocated[byRemainder[i % byRemainder.length]!.index]! += 1;
  }

  return allocated;
}

/** The trend's granularity: one bar per day until the range gets long. */
const MONTH_BUCKET_AFTER_DAYS = 31;

const UNCATEGORISED_ID = '__uncategorised__';

function spanInDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function shiftDays(dayKeyStr: string, days: number): string {
  const d = new Date(`${dayKeyStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextMonth(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));

  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Every period key from `from` to `to` inclusive. Empty when inverted. */
function periodKeys(from: string, to: string, bucket: 'day' | 'month'): string[] {
  if (from > to) return [];

  const keys: string[] = [];

  if (bucket === 'month') {
    const last = to.slice(0, 7);
    for (let cursor = from.slice(0, 7); ; cursor = nextMonth(cursor)) {
      keys.push(cursor);
      if (cursor === last) return keys;
    }
  }

  for (let cursor = from; cursor <= to; cursor = shiftDays(cursor, 1)) {
    keys.push(cursor);
  }
  return keys;
}

function bucketTrend(
  orders: ReportOrder[],
  timezone: string,
  from: string,
  to: string,
): { bucket: 'day' | 'month'; points: TrendPoint[] } {
  const bucket: 'day' | 'month' =
    spanInDays(from, to) > MONTH_BUCKET_AFTER_DAYS ? 'month' : 'day';

  const keyOf = (instant: Date) =>
    bucket === 'month'
      ? monthKey(instant, timezone)
      : dayKey(instant, timezone);

  const totals = new Map<string, TrendPoint>();
  for (const order of orders) {
    const key = keyOf(order.createdAt);
    const entry = totals.get(key) ?? { date: key, revenue: 0, transactions: 0 };
    entry.revenue += order.total;
    entry.transactions += 1;
    totals.set(key, entry);
  }

  // Zero-filled: a skipped day would let "last 30 days" read as a fortnight of
  // trading and hide how quiet the shop actually was.
  const points = periodKeys(from, to, bucket).map(
    (key) => totals.get(key) ?? { date: key, revenue: 0, transactions: 0 },
  );

  return { bucket, points };
}

export function summariseOrders(orders: ReportOrder[]): SalesReport['kpi'] {
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);
  const transactions = orders.length;

  return {
    revenue,
    transactions,
    averageOrderValue:
      transactions > 0 ? Math.round(revenue / transactions) : 0,
    itemsSold: orders.reduce(
      (sum, order) => sum + order.lines.reduce((n, line) => n + line.qty, 0),
      0,
    ),
    // Receipts carrying a phone number — the ones WhatsApp can reach.
    withCustomer: orders.filter((order) => order.customer?.phone).length,
  };
}

function paymentBreakdown(orders: ReportOrder[]): SalesReport['paymentBreakdown'] {
  const map = new Map<
    'cash' | 'qris' | 'debit' | 'credit',
    { count: number; total: number }
  >();

  for (const order of orders) {
    const entry = map.get(order.paymentMethod) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += order.total;
    map.set(order.paymentMethod, entry);
  }

  return [...map.entries()]
    .map(([method, entry]) => ({ method, ...entry }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Category split needs the catalogue because order lines only carry product
 * ids. A line whose product has been deleted routes to an "Uncategorised"
 * bucket rather than vanishing — dropping it would quietly make the table
 * disagree with the revenue KPI, and that comparison is never believed when it
 * is off.
 */
function categorySales(
  orders: ReportOrder[],
  products: { _id: Types.ObjectId; categoryId: unknown }[],
  categories: { _id: Types.ObjectId; name: string }[],
): CategorySalesRow[] {
  const categoryOf = new Map(
    products.map((product) => [
      String(product._id),
      product.categoryId instanceof Types.ObjectId
        ? product.categoryId.toHexString()
        : null, // No category (or a soft-deleted association) maps to nothing.
    ]),
  );
  const nameOf = new Map(categories.map((category) => [String(category._id), category.name]));
  const totals = new Map<string, { revenue: number; itemsSold: number }>();

  for (const order of orders) {
    const revenue = allocateGrossRevenue(order.lines, order.total);

    for (const [index, line] of order.lines.entries()) {
      const resolved = categoryOf.get(String(line.productId));
      const categoryId = resolved ?? UNCATEGORISED_ID;

      const entry = totals.get(categoryId) ?? { revenue: 0, itemsSold: 0 };
      entry.revenue += revenue[index] ?? 0;
      entry.itemsSold += line.qty;
      totals.set(categoryId, entry);
    }
  }

  return [...totals.entries()]
    .map(([categoryId, entry]) => ({
      categoryId,
      categoryName: nameOf.get(categoryId) ?? 'Uncategorised',
      ...entry,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function productSales(orders: ReportOrder[], limit = 10): ProductSalesRow[] {
  const totals = new Map<string, ProductSalesRow>();

  for (const order of orders) {
    const revenue = allocateGrossRevenue(order.lines, order.total);

    for (const [index, line] of order.lines.entries()) {
      const id = String(line.productId);
      const entry =
        totals.get(id) ??
        { productId: id, quantity: 0, name: line.name, revenue: 0 };

      entry.quantity += line.qty;
      entry.revenue += revenue[index] ?? 0;
      totals.set(id, entry);
    }
  }

  return [...totals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

function cashierSales(orders: ReportOrder[]): CashierSalesRow[] {
  const grouped = new Map<string, ReportOrder[]>();

  for (const order of orders) {
    const bucket = grouped.get(String(order.cashierId)) ?? [];
    bucket.push(order);
    grouped.set(String(order.cashierId), bucket);
  }

  return [...grouped.entries()]
    .map(([cashierId, bucket]) => {
      const { withCustomer: _withCustomer, ...summary } = summariseOrders(bucket);
      void _withCustomer;
      return {
        cashierId,
        cashierName: bucket[0]?.cashierName ?? 'Unknown',
        ...summary,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * The report for one range. Paid receipts only — a voided receipt was never a
 * sale; the transaction screen is the audit view of what was reversed.
 */
export async function salesReport(query: ReportQuery): Promise<SalesReport> {
  const { from, to } = query;
  const timezone = env().STORE_TIMEZONE;

  if (from > to) {
    throw ApiError.validation('The report range ends before it starts.', {
      to: 'Set the end date on or after the start date.',
    });
  }

  const filter: Record<string, unknown> = {
    createdAt: dayRange(from, to, timezone),
    status: 'paid' as const,
  };

  /**
   * The tile question shares the table question's filters: a till filtering its
   * ledger by method or customer search expects the tiles above it to narrow
   * the same way, so both screens answer one question about one window.
   */
  if (query.method) filter.paymentMethod = query.method;

  if (query.q) {
    const rx = new RegExp(escapeRegExp(query.q), 'i');
    const alternatives: Record<string, unknown>[] = [
      { receiptNo: rx },
      { 'customer.name': rx },
    ];
    if (/\d/.test(query.q)) alternatives.push({ 'customer.phone': rx });
    filter.$or = alternatives;
  }

  const [orders, products, categories] = await Promise.all([
    OrderModel.find(filter)
      .select('createdAt total paymentMethod cashierId cashierName customer lines')
      .lean<ReportOrder[]>(),
    // Deleted products still have to resolve their category; the report reads
    // every product ever, not just the ones currently on the shelf.
    ProductModel.find()
      .select('categoryId')
      .lean<{ _id: Types.ObjectId; categoryId: unknown }[]>(),
    CategoryModel.find()
      .select('name')
      .lean<{ _id: Types.ObjectId; name: string }[]>(),
  ]);

  const reportOrders: ReportOrder[] = orders.map((order) => ({
    createdAt: order.createdAt,
    total: order.total,
    paymentMethod: order.paymentMethod,
    cashierId: order.cashierId,
    cashierName: order.cashierName,
    customer:
      order.customer && order.customer.phone
        ? { phone: order.customer.phone }
        : null,
    lines: order.lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      price: line.price,
      qty: line.qty,
    })),
  }));

  return {
    from,
    to,
    kpi: summariseOrders(reportOrders),
    paymentBreakdown: paymentBreakdown(reportOrders),
    trend: bucketTrend(reportOrders, timezone, from, to),
    byCategory: categorySales(reportOrders, products, categories),
    topProducts: productSales(reportOrders),
    byCashier: cashierSales(reportOrders),
  };
}
