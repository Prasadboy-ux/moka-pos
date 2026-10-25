import { readDb } from "@/lib/repositories/mock/db";
import { simulateLatency } from "@/lib/repositories/mock/helpers";
import type { ReportsRepository, SalesReportData, SalesReportFilter } from "@/lib/repositories/types";
import {
  bucketTrend,
  cashierSales,
  categorySales,
  productSales,
  summarise,
} from "@/lib/repositories/report-math";
import type { Order } from "@/types/pos";

type PaymentMethodTally = {
  method: Order["paymentMethod"];
  count: number;
  total: number;
};

/**
 * The mock's sales report.
 *
 * Runs the same pure arithmetic the API implements, over the mock database's
 * orders. Only paid receipts count — a voided receipt was never a sale, the
 * same rule the transaction screen's report view applies everywhere.
 */
export const reportsRepository: ReportsRepository = {
  async sales(from, to, filter: SalesReportFilter = {}): Promise<SalesReportData> {
    await simulateLatency();

    const db = readDb();
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    const needle = filter.q?.trim().toLowerCase() ?? "";

    let orders: Order[] = db.orders.filter((order) => {
      if (order.status !== "paid") return false;

      const at = new Date(order.createdAt).getTime();
      return at >= fromTime && at <= toTime + 86_399_999;
    });

    /**
     * The tiles answer the same question the table under them asks, so the
     * filter the ledger list applies (method, customer-facing search) narrows
     * the aggregate too — the same field-and-needle rule orders.list uses.
     */
    if (filter.method) {
      orders = orders.filter((order) => order.paymentMethod === filter.method);
    }

    if (needle) {
      orders = orders.filter((order) => {
        const hits =
          order.receiptNo.toLowerCase().includes(needle) ||
          (order.customer?.name.toLowerCase().includes(needle) ?? false) ||
          (/\d/.test(needle)
            ? (order.customer?.phone.includes(needle) ?? false)
            : false);
        return hits;
      });
    }

    const { bucket, points } = bucketTrend(orders, from, to);

    return {
      from,
      to,
      kpi: summarise(orders),
      paymentBreakdown: orders.reduce<PaymentMethodTally[]>(
        (rows, order) => {
          const row = rows.find((entry) => entry.method === order.paymentMethod);
          if (row) {
            row.count += 1;
            row.total += order.total;
          } else {
            rows.push({
              method: order.paymentMethod,
              count: 1,
              total: order.total,
            });
          }
          return rows;
        },
        [],
      ),
      trend: { bucket, points },
      byCategory: categorySales(orders, db.products, db.categories),
      topProducts: productSales(orders),
      byCashier: cashierSales(orders),
    };
  },
};
