import { listOrders } from "@/services/orders";
import { listIngredients, listProducts } from "@/services/products";
import { isLowStock } from "@/services/reference";
import {
  PAYMENT_LABEL,
  TAX_RATE_DEFAULT,
  type Ingredient,
  type Order,
  type PaymentMethod,
  type Product,
  type Shift,
} from "@/types/pos";

/**
 * Read models for the dashboards. Kept separate from the raw order list so the
 * screen never does its own aggregation.
 */

export interface Kpi {
  todayRevenue: number;
  todayTransactions: number;
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
  /**
   * Ingredients are consumed through recipes; direct products are counted
   * themselves. Both can fall low, and both belong on the admin's radar.
   */
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

export interface DashboardSummary {
  kpi: Kpi;
  paymentBreakdown: PaymentBreakdownRow[];
  trend: SalesTrendPoint[];
  lowStock: LowStockItem[];
  recentOrders: Order[];
  totalProducts: number;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function toDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function summarise(orders: Order[]): Kpi {
  const today = startOfToday();
  const todays = orders.filter(
    (o) => new Date(o.createdAt).getTime() >= today,
  );

  const todayRevenue = todays.reduce((sum, o) => sum + o.total, 0);

  return {
    todayRevenue,
    todayTransactions: todays.length,
    averageOrderValue:
      todays.length > 0 ? Math.round(todayRevenue / todays.length) : 0,
    itemsSold: todays.reduce(
      (sum, o) => sum + o.lines.reduce((n, l) => n + l.qty, 0),
      0,
    ),
  };
}

function breakdown(orders: Order[]): PaymentBreakdownRow[] {
  const today = startOfToday();
  const todays = orders.filter((o) => new Date(o.createdAt).getTime() >= today);

  const map = new Map<PaymentMethod, { count: number; total: number }>();
  for (const order of todays) {
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

function trend(orders: Order[]): SalesTrendPoint[] {
  const points = new Map<string, SalesTrendPoint>();

  for (const order of orders) {
    const key = toDayKey(new Date(order.createdAt).getTime());
    const entry = points.get(key) ?? {
      date: key,
      revenue: 0,
      transactions: 0,
    };
    entry.revenue += order.total;
    entry.transactions += 1;
    points.set(key, entry);
  }

  return [...points.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
}

export async function getAdminDashboard(): Promise<DashboardSummary> {
  const products: Product[] = await listProducts();
  const ingredients: Ingredient[] = await listIngredients();
  const orders = await listOrders(products, TAX_RATE_DEFAULT);

  const lowStock: LowStockItem[] = [
    ...ingredients.filter(isLowStock).map((i) => ({
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
  ].sort((a, b) => a.stock - b.stock);

  return {
    kpi: summarise(orders),
    paymentBreakdown: breakdown(orders),
    trend: trend(orders),
    lowStock,
    recentOrders: orders.slice(0, 8),
    totalProducts: products.length,
  };
}

export interface CashierDashboardSummary {
  kpi: Kpi;
  recentOrders: Order[];
  lowStockCount: number;
  openShift: Shift | null;
}

/**
 * A cashier only cares about their own shift, so this deliberately excludes
 * other cashiers' takings and global revenue figures.
 */
export async function getCashierDashboard(
  userId: string,
  userName: string,
  openShift: Shift | null,
): Promise<CashierDashboardSummary> {
  const products = await listProducts();
  const ingredients = await listIngredients();
  const orders = await listOrders(products, TAX_RATE_DEFAULT);

  const mine = orders.filter((o) => o.cashierId === userId);

  return {
    kpi: summarise(mine),
    recentOrders: mine.slice(0, 6),
    lowStockCount: ingredients.filter(isLowStock).length,
    openShift,
  };
}