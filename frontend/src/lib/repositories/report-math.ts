import {
  PAYMENT_LABEL,
  type Category,
  type Ingredient,
  type Order,
  type PaymentMethod,
  type Product,
} from "@/types/pos";

/**
 * Pure report arithmetic.
 *
 * Every function here is a calculation on data it was handed — no fetching, no
 * repositories, no React. That is what lets the mock repository, the HTTP read
 * models, and the specs all agree on the same figures without importing each
 * other: the math is the shared constant, the transports differ.
 */

export interface Kpi {
  revenue: number;
  transactions: number;
  averageOrderValue: number;
  itemsSold: number;
  /** Paid receipts carrying a phone number — the ones WhatsApp can reach. */
  withCustomer: number;
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

// ----------------------------------------------------------------- calendar

/**
 * The zone day keys are computed in. A report opened at 00:30 in Jakarta must
 * put that sale on today's bar, not on yesterday's because the browser was set
 * to UTC.
 *
 * The API publishes the zone it actually buckets days with on `GET /api/config`;
 * `adoptStoreTimezone` copies it there so changing the store's `STORE_TIMEZONE`
 * does not depend on the browser bundle having been built with the same value.
 * Until the reply lands (one request into a session), the build-time default
 * applies.
 */
const DEFAULT_DAY_ZONE =
  process.env.NEXT_PUBLIC_STORE_TIMEZONE || "Asia/Jakarta";

/** Restrict the advertised zone to the characters an IANA name uses. */
const ZONE_PATTERN = /^[A-Za-z0-9_+\-/]+$/;

let advertisedZone: string | null = null;

/** Null resets to the build-time default; used by tests and on bad replies. */
export function adoptStoreTimezone(zone: string | null): void {
  advertisedZone = zone && ZONE_PATTERN.test(zone) ? zone : null;
}

/** The zone actually in use by `todayKey` and friends right now. */
export function effectiveStoreTimezone(): string {
  return advertisedZone ?? DEFAULT_DAY_ZONE;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

function dayFormatFor(zone: string): Intl.DateTimeFormat {
  let format = dayFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormats.set(zone, format);
  }
  return format;
}

const monthFormats = new Map<string, Intl.DateTimeFormat>();

function monthFormatFor(zone: string): Intl.DateTimeFormat {
  let format = monthFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
    });
    monthFormats.set(zone, format);
  }
  return format;
}

function formatKey(format: Intl.DateTimeFormat, timestamp: number): string {
  const parts = format.formatToParts(new Date(timestamp));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function toDayKey(timestamp: number): string {
  return formatKey(dayFormatFor(effectiveStoreTimezone()), timestamp);
}

/** yyyy-mm-dd for `days` before today, in the store's timezone. */
export function dayKeyDaysAgo(days: number): string {
  return shiftDays(todayKey(), -days);
}

export function todayKey(): string {
  return formatKey(dayFormatFor(effectiveStoreTimezone()), Date.now());
}

/** yyyy-mm. The month a timestamp falls in, in the store's timezone. */
export function monthKey(timestamp: number): string {
  const parts = monthFormatFor(effectiveStoreTimezone()).formatToParts(
    new Date(timestamp),
  );
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

/**
 * Calendar arithmetic on `yyyy-mm-dd` strings.
 *
 * Parsed as UTC on purpose: a date-only value has no timezone, and letting the
 * host zone interpret it made "yesterday" depend on where the browser was, not
 * on the store's calendar.
 */
export function shiftDays(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function spanInDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

// -------------------------------------------------------------- aggregation

export function summarise(orders: Order[]): Kpi {
  const revenue = orders.reduce((sum, o) => sum + o.total, 0);

  return {
    revenue,
    transactions: orders.length,
    averageOrderValue: orders.length > 0 ? Math.round(revenue / orders.length) : 0,
    itemsSold: orders.reduce((sum, o) => sum + o.lines.reduce((n, l) => n + l.qty, 0), 0),
    withCustomer: orders.filter((o) => o.customer?.phone).length,
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

/**
 * The same rows for answer data that already has the split made — the server
 * reports raw `method`/`count`/`total`, and the label and share are
 * presentation that still belongs to whichever screen draws them.
 */
export function paymentRowsToBreakdown(
  rows: Array<{ method: PaymentMethod; count: number; total: number }>,
): PaymentBreakdownRow[] {
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return rows.map((row) => ({
    ...row,
    label: PAYMENT_LABEL[row.method],
    share: grandTotal > 0 ? row.total / grandTotal : 0,
  }));
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
 * This covers the range end to end and returns every period in it — including
 * the ones with no sales. Skipping those would let a report for the last 30
 * days render as a fortnight of trading and read as though the rest of the
 * month never happened.
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
