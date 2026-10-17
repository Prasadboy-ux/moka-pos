import type {
  Order,
  OrderLine,
  PaymentMethod,
  Product,
} from "@/types/pos";

/**
 * Mock order store, seeded with a week of plausible history so the dashboard
 * has something to show. Holds state in memory for the session; the real
 * service will POST to Express instead.
 */

function simulateLatency(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CASHIERS = [
  { id: "u-2", name: "Siti Rahayu" },
  { id: "u-3", name: "Andi Wijaya" },
] as const;

const PAYMENT_MIX: PaymentMethod[] = [
  "qris",
  "qris",
  "cash",
  "cash",
  "cash",
  "debit",
  "credit",
];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildHistory(products: Product[], taxRate: number): Order[] {
  const rand = mulberry32(20261017);
  const sellable = products.filter((p) => p.isActive);
  const orders: Order[] = [];
  const now = Date.now();

  let receiptCounter = 1000;

  // Seven days of trading, ending today.
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - dayOffset);

    // Busier at weekends, and quieter for the days furthest back.
    const weekday = dayStart.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const orderCount = Math.round(
      (isWeekend ? 34 : 24) * (0.7 + rand() * 0.4) * (1 - dayOffset * 0.02),
    );

    for (let i = 0; i < orderCount; i++) {
      const lineCount = 1 + Math.floor(rand() * 3);
      const lines: OrderLine[] = [];

      for (let l = 0; l < lineCount; l++) {
        const product = sellable[Math.floor(rand() * sellable.length)];
        if (!product) continue;
        if (lines.some((line) => line.productId === product.id)) continue;
        lines.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: 1 + Math.floor(rand() * 2),
          stockMode: product.stockMode,
        });
      }

      if (lines.length === 0) continue;

      const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      const taxAmount = Math.round(subtotal * taxRate);
      const total = subtotal + taxAmount;

      const cashier = CASHIERS[Math.floor(rand() * CASHIERS.length)];
      const method = PAYMENT_MIX[Math.floor(rand() * PAYMENT_MIX.length)];

      if (!cashier || !method) continue;

      // Spread orders across trading hours, 08:00-21:00.
      const createdAt = new Date(dayStart);
      createdAt.setHours(8 + Math.floor(rand() * 13), Math.floor(rand() * 60), 0, 0);

      if (createdAt.getTime() > now) continue;

      receiptCounter += 1;

      // Cash rounds up to the nearest 5,000 so change is realistic.
      const paidAmount =
        method === "cash" ? Math.ceil(total / 5000) * 5000 : total;

      orders.push({
        id: `o-${receiptCounter}`,
        receiptNo: `MOKA-${receiptCounter}`,
        lines,
        subtotal,
        taxRate,
        taxAmount,
        total,
        paymentMethod: method,
        paidAmount,
        changeAmount: paidAmount - total,
        cashierId: cashier.id,
        cashierName: cashier.name,
        createdAt: createdAt.toISOString(),
      });
    }
  }

  return orders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

let orders: Order[] | null = null;
let nextReceiptCounter = 2000;

async function seed(products: Product[], taxRate: number): Promise<Order[]> {
  if (!orders) {
    orders = buildHistory(products, taxRate);
    nextReceiptCounter = 2000 + orders.length + 1;
  }
  return orders;
}

export interface CreateOrderInput {
  lines: OrderLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  changeAmount: number;
  cashierId: string;
  cashierName: string;
}

export async function listOrders(
  products: Product[],
  taxRate: number,
): Promise<Order[]> {
  await simulateLatency();
  return [...(await seed(products, taxRate))];
}

export async function listRecentOrders(
  products: Product[],
  taxRate: number,
  limit = 8,
): Promise<Order[]> {
  const all = await listOrders(products, taxRate);
  return all.slice(0, limit);
}

export async function listOrdersByCashier(
  products: Product[],
  taxRate: number,
  cashierId: string,
  limit = 6,
): Promise<Order[]> {
  const all = await listOrders(products, taxRate);
  return all.filter((o) => o.cashierId === cashierId).slice(0, limit);
}

export async function createOrder(
  products: Product[],
  taxRate: number,
  input: CreateOrderInput,
): Promise<Order> {
  await simulateLatency(180);

  /**
   * Seed before writing. A cashier who signs straight into the POS completes a
   * sale without anything having read the order list, and without this the
   * write would leave a one-element store that permanently suppresses the
   * seeded history for every later read.
   */
  const existing = await seed(products, taxRate);

  const order: Order = {
    ...input,
    id: `o-${nextReceiptCounter}`,
    receiptNo: `MOKA-${nextReceiptCounter}`,
    createdAt: new Date().toISOString(),
  };
  nextReceiptCounter += 1;

  orders = [order, ...existing];
  return order;
}

/** Test seam so the store can be reset between runs. */
export function __resetOrders(): void {
  orders = null;
  nextReceiptCounter = 2000;
}