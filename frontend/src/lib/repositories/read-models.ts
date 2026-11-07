"use client";

import { getRepositories } from "@/lib/repositories";
import type { Order, Shift } from "@/types/pos";
import {
  dayKeyDaysAgo,
  lowStockItems,
  paymentRowsToBreakdown,
  shiftDays,
  spanInDays,
  todayKey,
} from "./report-math";
import type {
  CashierSalesRow,
  CategorySalesRow,
  Kpi,
  LowStockItem,
  PaymentBreakdownRow,
  ProductSalesRow,
  SalesTrendPoint,
  TrendBucket,
} from "./report-math";

/**
 * Read models for the dashboard and the reports screen.
 *
 * The heavy arithmetic lives on the server now — `GET /api/reports/sales`
 * allocates revenue, buckets trends and resolves categories where the orders
 * live. What remains on this side is orchestration (which ranges to ask for)
 * and the presentation step the aggregate deliberately leaves out: labels, and
 * each method's share of the till. A figure the screen needs beyond this comes
 * in the reply instead of by refetching every receipt in the range.
 */
export * from "./report-math";

// --------------------------------------------------------------- read models

export interface DashboardSummary {
  kpi: Kpi;
  paymentBreakdown: PaymentBreakdownRow[];
  trend: SalesTrendPoint[];
  lowStock: LowStockItem[];
  recentOrders: Order[];
  totalProducts: number;
  /** Drawers still open, so the overview can show who is on the floor. */
  openShifts: Shift[];
}

export async function getAdminDashboard(): Promise<DashboardSummary> {
  const { config, products, ingredients, orders, reports, shifts } =
    getRepositories();

  /**
   * Config first: its reply carries the zone the API buckets days in, and the
   * `todayKey()` calls below adopt it as a side effect. Computing the window
   * before waiting on config could send `weekStart` through a stale zone on a
   * cold session.
   */
  await config.get();

  const weekStart = dayKeyDaysAgo(6);
  const today = todayKey();

  const [productList, ingredientList, recentOrders, week, currentDay, shiftList] =
    await Promise.all([
      products.list(),
      ingredients.list(),
      orders.recent(8),
      // The trend strip spans the week; the headline needs the trading day,
      // not the trading week. Both aggregates answer `paid` only, and ask the
      // server for exactly that window so the payload stays bounded as the
      // shop grows — no full sale history is ever shipped to the dashboard.
      reports.sales(weekStart, today),
      reports.sales(today, today),
      shifts.list(),
    ]);

  return {
    kpi: currentDay.kpi,
    paymentBreakdown: paymentRowsToBreakdown(currentDay.paymentBreakdown),
    trend: week.trend.points,
    lowStock: lowStockItems(productList, ingredientList),
    recentOrders,
    totalProducts: productList.length,
    openShifts: shiftList.filter((shift) => shift.status === "open"),
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
export async function getSalesReport(
  from: string,
  to: string,
): Promise<SalesReport> {
  const { reports } = getRepositories();

  const spanDays = spanInDays(from, to);
  const previousTo = shiftDays(from, -1);
  const previousFrom = shiftDays(from, -(spanDays + 1));

  const [current, previous] = await Promise.all([
    // A voided receipt was never a sale: the endpoint answers `paid` only,
    // leaving the transaction screen as the audit view of what was reversed.
    reports.sales(from, to),
    reports.sales(previousFrom, previousTo),
  ]);

  return {
    kpi: current.kpi,
    previousKpi: previous.kpi,
    paymentBreakdown: paymentRowsToBreakdown(current.paymentBreakdown),
    trend: current.trend.points,
    trendBucket: current.trend.bucket,
    byCategory: current.byCategory,
    topProducts: current.topProducts,
    byCashier: current.byCashier,
  };
}
