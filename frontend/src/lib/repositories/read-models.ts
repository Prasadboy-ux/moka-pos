"use client";

import { getRepositories } from "@/lib/repositories";
import {
  PAYMENT_LABEL,
  type Category,
  type Ingredient,
  type Order,
  type PaymentMethod,
  type Product,
} from "@/types/pos";

/**
 * Aggregations for the dashboard and the reports screen.
 *
 * Kept out of the components so a screen never sums its own numbers: both
 * screens need the same arithmetic, and a screen-local copy would drift from the
 * figures shown on the other one.
 */

export interface Kpi {
  revenue: number;
  transactions: number;
  averageOrderValue: number;
  itemsSold: number;
}

export interface PaymentBreakdownRow {
  method: PaymentMethod;
  label: string;
  count: number;
  total: number;
  share: number;
}

export interface LowStockItem {
  id: string;
  name: string;
  /** Ingredients are consumed through recipes; direct items count themselves. */
  kind: "ingredient" | "product";
  stock: number;
  minStock: number;
  unit: string;
}

export interface SalesTrendPoint {
  /**
   * `yyyy-mm-dd` for a day bucket, `yyyy-mm` for a month bucket. The report
   * carries its own granularity so the axis knows which label to render.
   */
  date: string;
  revenue: number;
  transactions: number;
}

export type TrendBucket = "day" | "month";

export interface CategorySalesRow {
  categoryId: string;
  categoryName: string;
  revenue: number;
  itemsSold: number;
}

export interface ProductSalesRow {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface CashierSalesRow {
  cashierId: string;
  cashierName: string;
  transactions: number;
  revenue: number;
  averageOrderValue: number;
  itemsSold: number;
}

// -------------------------------------------------------------------- helpers

/**
 * The zone the API groups days in. A report opened at 00:30 in Jakarta must put
 * that sale on today's bar, not on yesterday's because the browser was set to
 * UTC. Keep this equal to the API's `STORE_TIMEZONE`.
 */
export const STORE_TIMEZONE =
  process.env.NEXT_PUBLIC_STORE_TIMEZONE || "Asia/Jakarta";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const monthFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
});

function formatKey(format: Intl.DateTimeFormat, timestamp: number): string {
  const parts = format.formatToParts(new Date(timestamp));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function toDayKey(timestamp: number): string {
  return formatKey(dayFormat, timestamp);
}

/** yyyy-mm-dd for `days` before today, in the store's timezone. */
export function dayKeyDaysAgo(days: number): string {
  return shiftDays(todayKey(), -days);
}

export function todayKey(): string {
  return formatKey(dayFormat, Date.now());
}

/** yyyy-mm. The month a timestamp falls in, in the store's timezone. */
export function monthKey(timestamp: number): string {
  const parts = monthFormat.formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

/** First day of the month `months` months before the current store month. */
export function monthStartMonthsAgo(months: number): string {
  const [year, month] = todayKey().slice(0, 7).split("-").map(Number) as [
    number,
    number,
  ];
  const index = year * 12 + (month - 1) - months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
}

export function summarise(orders: Order[]): Kpi {
  const revenue = orders.reduce((sum, o) => sum + o.total, 0);

  return {
    revenue,
    transactions: orders.length,
    averageOrderValue: orders.length > 0 ? Math.round(revenue / orders.length) : 0,
    itemsSold: orders.reduce((sum, o) => sum + o.lines.reduce((n, l) => n + l.qty, 0), 0),
  };
}

/**
 * Splits an order's gross total (`total`, PPN included) across its lines.
 *
 * Line arithmetic only knows pre-tax prices, so summing it made every category
 * and product row understate revenue by the tax on that order. Allocating the
 * order total in proportion to the lines — and giving leftover rupiah to the
 * largest fractional shares — makes the breakdown add up to the KPI exactly,
 * with no lost or invented cents.
 */
export function allocateGrossRevenue(order: Order): number[] {
  const weights = order.lines.map((line) => line.price * line.qty);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  if (weightTotal <= 0 || order.total <= 0) {
    return order.lines.map(() => 0);
  }

  const exact = weights.map((weight) => (weight / weightTotal) * order.total);
  const allocated = exact.map(Math.floor);
  let remaining = order.total - allocated.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; remaining > 0; i += 1, remaining -= 1) {
    allocated[byRemainder[i % byRemainder.length]!.index]! += 1;
  }

  return allocated;
}

export function paymentBreakdown(orders: Order[]): PaymentBreakdownRow[] {
  const map = new Map<PaymentMethod, { count: number; total: number }>();

  for (const order of orders) {
    const entry = map.get(order.paymentMethod) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += order.total;
    map.set(order.paymentMethod, entry);
  }

  const grandTotal = [...map.values()].reduce((sum, e) => sum + e.total, 0);

  return [...map.entries()]
    .map(([method, entry]) => ({
      method,
      label: PAYMENT_LABEL[method],
      count: entry.count,
      total: entry.total,
      share: grandTotal > 0 ? entry.total / grandTotal : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function trend(orders: Order[], days = 7): SalesTrendPoint[] {
  const points = new Map<string, SalesTrendPoint>();

  for (const order of orders) {
    const key = toDayKey(new Date(order.createdAt).getTime());
    const entry = points.get(key) ?? { date: key, revenue: 0, transactions: 0 };
    entry.revenue += order.total;
    entry.transactions += 1;
    points.set(key, entry);
  }

  return [...points.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}

/**
 * Past this span one bar per day stops being readable, so the chart switches to
 * months. A month is the unit the cafe actually reviews in, so this is also the
 * threshold that makes a monthly report a monthly report rather than 365 of them.
 */
const MONTH_BUCKET_AFTER_DAYS = 31;

/**
 * Trend across a whole date range, at the granularity the range can support.
 *
 * Unlike `trend`, which is the dashboard's "last N trading days" strip, this
 * covers the range end to end and returns every period in it — including the ones
 * with no sales. Skipping those would let a report for the last 30 days render as
 * a fortnight of trading and read as though the rest of the month never happened.
 */
export function bucketTrend(
  orders: Order[],
  from: string,
  to: string,
): { bucket: TrendBucket; points: SalesTrendPoint[] } {
  const bucket: TrendBucket =
    spanInDays(from, to) > MONTH_BUCKET_AFTER_DAYS ? "month" : "day";

  const keyOf = (timestamp: number) =>
    bucket === "month" ? monthKey(timestamp) : toDayKey(timestamp);

  const totals = new Map<string, SalesTrendPoint>();
  for (const order of orders) {
    const key = keyOf(new Date(order.createdAt).getTime());
    const entry = totals.get(key) ?? { date: key, revenue: 0, transactions: 0 };
    entry.revenue += order.total;
    entry.transactions += 1;
    totals.set(key, entry);
  }

  const points = periodKeys(from, to, bucket).map(
    (key) => totals.get(key) ?? { date: key, revenue: 0, transactions: 0 },
  );

  return { bucket, points };
}

/** Every period key from `from` to `to` inclusive. Empty when the range is inverted. */
function periodKeys(from: string, to: string, bucket: TrendBucket): string[] {
  if (from > to) return [];

  const keys: string[] = [];

  if (bucket === "month") {
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

function nextMonth(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));

  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Bucket key for a product that no longer exists, so its sales still total. */
const UNCATEGORISED_ID = "__uncategorised__";

/**
 * Order lines only carry product ids, so a category split has to be resolved
 * against the catalogue. That is why the product list is a parameter instead of
 * something looked up inside: the caller already has it, and a hidden lookup
 * would mean a silent second fetch.
 *
 * A product that has been deleted resolves to nothing, and its revenue is
 * routed to an "Uncategorised" bucket rather than skipped — dropping it here
 * would quietly make the category table disagree with the revenue total above
 * it, which is the one comparison nobody can be expected to notice.
 */
export function categorySales(
  orders: Order[],
  products: Product[],
  categories: Category[],
): CategorySalesRow[] {
  const categoryOf = new Map(products.map((p) => [p.id, p.categoryId]));
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const totals = new Map<string, { revenue: number; itemsSold: number }>();

  for (const order of orders) {
    const revenue = allocateGrossRevenue(order);

    for (const [index, line] of order.lines.entries()) {
      const categoryId = categoryOf.get(line.productId) ?? UNCATEGORISED_ID;

      const entry = totals.get(categoryId) ?? { revenue: 0, itemsSold: 0 };
      entry.revenue += revenue[index] ?? 0;
      entry.itemsSold += line.qty;
      totals.set(categoryId, entry);
    }
  }

  return [...totals.entries()]
    .map(([categoryId, entry]) => ({
      categoryId,
      categoryName: nameOf.get(categoryId) ?? "Uncategorised",
      ...entry,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function productSales(orders: Order[], limit = 10): ProductSalesRow[] {
  const totals = new Map<string, ProductSalesRow>();

  for (const order of orders) {
    const revenue = allocateGrossRevenue(order);

    for (const [index, line] of order.lines.entries()) {
      const entry =
        totals.get(line.productId) ??
        {
          productId: line.productId,
          quantity: 0,
          name: line.name,
          revenue: 0,
        };

      entry.quantity += line.qty;
      entry.revenue += revenue[index] ?? 0;
      totals.set(line.productId, entry);
    }
  }

  return [...totals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export function cashierSales(orders: Order[]): CashierSalesRow[] {
  const grouped = new Map<string, Order[]>();

  for (const order of orders) {
    const bucket = grouped.get(order.cashierId) ?? [];
    bucket.push(order);
    grouped.set(order.cashierId, bucket);
  }

  return [...grouped.entries()]
    .map(([cashierId, bucket]) => ({
      cashierId,
      cashierName: bucket[0]?.cashierName ?? "Unknown",
      ...summarise(bucket),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Everything at or below its reorder threshold, across both stock modes. */
export function lowStockItems(
  products: Product[],
  ingredients: Ingredient[],
): LowStockItem[] {
  const items: LowStockItem[] = [
    ...ingredients
      .filter((i) => i.stock <= i.minStock)
      .map((i) => ({
        id: i.id,
        name: i.name,
        kind: "ingredient" as const,
        stock: i.stock,
        minStock: i.minStock,
        unit: i.unit,
      })),
    ...products
      .filter(
        (p) =>
          p.stockMode === "direct" &&
          p.isActive &&
          typeof p.stock === "number" &&
          typeof p.minStock === "number" &&
          p.stock <= p.minStock,
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        kind: "product" as const,
        stock: p.stock ?? 0,
        minStock: p.minStock ?? 0,
        unit: "pcs",
      })),
  ];

  return items.sort((a, b) => a.stock - b.stock);
}

/** Percentage change, or null when there is no comparable previous figure. */
export function delta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// --------------------------------------------------------------- read models

export interface DashboardSummary {
  kpi: Kpi;
  paymentBreakdown: PaymentBreakdownRow[];
  trend: SalesTrendPoint[];
  lowStock: LowStockItem[];
  recentOrders: Order[];
  totalProducts: number;
}

export async function getAdminDashboard(): Promise<DashboardSummary> {
  const { products, ingredients, orders } = getRepositories();

  const today = todayKey();
  const weekStart = dayKeyDaysAgo(6);

  const [productList, ingredientList, recentOrders, weekOrders] =
    await Promise.all([
      products.list(),
      ingredients.list(),
      orders.recent(8),
      // The dashboard needs today plus the trend strip, not all history. Asking
      // for seven calendar days keeps the payload bounded as the shop grows.
      orders.list({ from: weekStart, to: today }),
    ]);

  const todays = weekOrders.filter(
    (order) => toDayKey(new Date(order.createdAt).getTime()) === today,
  );

  return {
    kpi: summarise(todays),
    paymentBreakdown: paymentBreakdown(todays),
    trend: trend(weekOrders),
    lowStock: lowStockItems(productList, ingredientList),
    recentOrders,
    totalProducts: productList.length,
  };
}

export interface SalesReport {
  kpi: Kpi;
  previousKpi: Kpi;
  paymentBreakdown: PaymentBreakdownRow[];
  trend: SalesTrendPoint[];
  /** Tells the axis whether `trend` keys are days or months. */
  trendBucket: TrendBucket;
  byCategory: CategorySalesRow[];
  topProducts: ProductSalesRow[];
  byCashier: CashierSalesRow[];
}

/**
 * The report for a closed date range, plus the range immediately before it so
 * every figure can carry a delta.
 */
export async function getSalesReport(from: string, to: string): Promise<SalesReport> {
  const { orders, products, categories } = getRepositories();

  const spanDays = spanInDays(from, to);
  const previousTo = shiftDays(from, -1);
  const previousFrom = shiftDays(from, -(spanDays + 1));

  const [current, previous, productList, categoryList] = await Promise.all([
    orders.list({ from, to }),
    orders.list({ from: previousFrom, to: previousTo }),
    products.list({ includeInactive: true }),
    categories.list(),
  ]);

  const { bucket, points } = bucketTrend(current, from, to);

  return {
    kpi: summarise(current),
    previousKpi: summarise(previous),
    paymentBreakdown: paymentBreakdown(current),
    trend: points,
    trendBucket: bucket,
    byCategory: categorySales(current, productList, categoryList),
    topProducts: productSales(current),
    byCashier: cashierSales(current),
  };
}

/**
 * Calendar arithmetic on `yyyy-mm-dd` strings.
 *
 * Parsed as UTC on purpose: a date-only value has no timezone, and letting the
 * host zone interpret it made "yesterday" depend on where the browser was, not
 * on the store's calendar.
 */
function shiftDays(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function spanInDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}