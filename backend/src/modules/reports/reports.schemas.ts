import { z } from 'zod';
import { dayString } from '../../lib/schemas.js';

/**
 * A closed date range, inclusive on both ends.
 *
 * Reports have no sensible default window — a report that quietly means
 * "today" when the caller forgot a date would agree with the screen behind it
 * while answering a different question. Both bounds are mandatory, which also
 * keeps the trend's zero-filled points anchored to a range that exists.
 */
export const reportQuery = z.object({
  from: dayString,
  to: dayString,
  /**
   * When the till filters its tiles by what it is looking at, the report has to
   * answer through the same lens — the transaction screen's tiles and its
   * table are the same question about the same window.
   */
  method: z.enum(['cash', 'qris', 'debit', 'credit']).optional(),
  q: z
    .string()
    .trim()
    .max(40, 'Keep the search under 40 characters.')
    .optional(),
});

export type ReportQuery = z.infer<typeof reportQuery>;

export type TrendPoint = { date: string; revenue: number; transactions: number };

export type SalesReportKpi = {
  revenue: number;
  transactions: number;
  averageOrderValue: number;
  itemsSold: number;
  /**
   * Paid receipts carrying a phone number — the count the till labels "can be
   * sent", because WhatsApp is the only channel the receipt can reach a
   * customer through, and a phone is the one thing it cannot work without.
   */
  withCustomer: number;
};

export type CategorySalesRow = {
  categoryId: string;
  categoryName: string;
  revenue: number;
  itemsSold: number;
};

export type ProductSalesRow = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type CashierSalesRow = {
  cashierId: string;
  cashierName: string;
  transactions: number;
  revenue: number;
  averageOrderValue: number;
  itemsSold: number;
};

export type SalesReport = {
  from: string;
  to: string;
  kpi: SalesReportKpi;
  /** `share` and display labels are presentation and stay with the client. */
  paymentBreakdown: {
    method: 'cash' | 'qris' | 'debit' | 'credit';
    count: number;
    total: number;
  }[];
  trend: {
    bucket: 'day' | 'month';
    points: TrendPoint[];
  };
  byCategory: CategorySalesRow[];
  topProducts: ProductSalesRow[];
  byCashier: CashierSalesRow[];
};
