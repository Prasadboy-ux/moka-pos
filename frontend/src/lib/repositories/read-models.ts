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
  /** yyyy-mm-dd */
  date: string;
  revenue: number;
  transactions: number;
}

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

export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function toDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** yyyy-mm-dd for `days` before today. */
export function dayKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return toDayKey(d.getTime());
}

export function todayKey(): string {
  return dayKeyDaysAgo(0);
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
 * Order lines only carry product ids, so a category split has to be resolved
 * against the catalogue. That is why the product list is a parameter instead of
 * something looked up inside: the caller already has it, and a hidden lookup
 * would mean a silent second fetch.
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
    for (const line of order.lines) {
      const categoryId = categoryOf.get(line.productId);
      if (!categoryId) continue;

      const entry = totals.get(categoryId) ?? { revenue: 0, itemsSold: 0 };
      entry.revenue += line.price * line.qty;
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
    for (const line of order.lines) {
      const entry =
        totals.get(line.productId) ??
        {
          productId: line.productId,
          name: line.name,
          quantity: 0,
          revenue: 0,
        };

      entry.quantity += line.qty;
      entry.revenue += line.price * line.qty;
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

  const [productList, ingredientList, orderList] = await Promise.all([
    products.list(),
    ingredients.list(),
    orders.list(),
  ]);

  const todays = orderList.filter(
    (o) => new Date(o.createdAt).getTime() >= startOfToday(),
  );

  return {
    kpi: summarise(todays),
    paymentBreakdown: paymentBreakdown(todays),
    trend: trend(orderList),
    lowStock: lowStockItems(productList, ingredientList),
    recentOrders: orderList.slice(0, 8),
    totalProducts: productList.length,
  };
}

export interface SalesReport {
  kpi: Kpi;
  previousKpi: Kpi;
  paymentBreakdown: PaymentBreakdownRow[];
  trend: SalesTrendPoint[];
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

  return {
    kpi: summarise(current),
    previousKpi: summarise(previous),
    paymentBreakdown: paymentBreakdown(current),
    trend: trend(current, 14),
    byCategory: categorySales(current, productList, categoryList),
    topProducts: productSales(current),
    byCashier: cashierSales(current),
  };
}

function shiftDays(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDayKey(d.getTime());
}

function spanInDays(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}