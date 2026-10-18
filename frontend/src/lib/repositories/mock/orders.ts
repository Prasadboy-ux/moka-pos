"use client";

import { mutate, readDb } from "@/lib/repositories/mock/db";
import { clone, simulateLatency } from "@/lib/repositories/mock/helpers";
import { applySale } from "@/lib/repositories/mock/stock";
import type { CreateOrderInput, OrderRepository } from "@/lib/repositories/types";
import {
  calculateTax,
  normalisePhone,
  roundIDR,
  TAX_RATE_DEFAULT,
  type Order,
  type OrderCustomer,
  type OrderLine,
  type StockMode,
} from "@/types/pos";

function newestFirst(a: Order, b: Order): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * Turns the product list the caller passed back into order lines carrying the
 * name, price, and stock mode captured at the moment of sale.
 *
 * Those fields are denormalised on purpose: a receipt printed in two years must
 * still show the price that was charged, not today's.
 */
function buildLines(
  db: { products: ReadonlyArray<{ id: string; name: string; price: number; stockMode: StockMode }> },
  input: CreateOrderInput,
): OrderLine[] {
  return input.lines.map((line) => {
    const product = db.products.find((p) => p.id === line.productId);
    if (!product) throw new Error(`Product ${line.productId} no longer exists.`);
    if (line.qty <= 0) throw new Error("Quantity must be at least 1.");

    return {
      productId: product.id,
      name: product.name,
      price: product.price,
      qty: line.qty,
      stockMode: product.stockMode,
    };
  });
}

/**
 * Cleans up whatever the cashier typed into something a link can be built from.
 *
 * Normalised here rather than in the dialog because this is the only layer that
 * every write passes through: once an order carries a half-typed or un-normalised
 * number, nothing downstream can tell whether it is worth sending a receipt to.
 *
 * Returns null when there is nothing to send to, so an order never stores a
 * customer object that cannot be acted on.
 */
function normaliseCustomer(input: CreateOrderInput): OrderCustomer | null {
  const raw = input.customer;
  if (!raw) return null;

  const phone = normalisePhone(raw.phone);
  if (!phone) return null;

  const name = raw.name.trim();
  const email = raw.email?.trim() || null;

  // A number with no name still identifies the customer for sending purposes,
  // but a name on its own cannot, so the number is the part that has to be there.
  return { name: name || "Customer", phone, email };
}

export const orderRepository: OrderRepository = {
  async list(query = {}) {
    await simulateLatency();
    const { cashierId, from, to } = query;
    const fromTime = from ? new Date(from).getTime() : null;
    const toTime = to ? new Date(to).getTime() : null;

    return readDb()
      .orders.map(clone)
      .filter((order) => {
        if (cashierId && order.cashierId !== cashierId) return false;

        const at = new Date(order.createdAt).getTime();
        // `to` is a yyyy-mm-dd, so it lands at midnight; extend it to the end
        // of that day or a range ending today would silently drop every sale.
        if (fromTime !== null && at < fromTime) return false;
        if (toTime !== null && at > toTime + 86_399_999) return false;
        return true;
      })
      .sort(newestFirst);
  },

  async getById(id) {
    const order = readDb().orders.find((o) => o.id === id);
    return order ? clone(order) : undefined;
  },

  async recent(limit = 8) {
    await simulateLatency();
    return readDb()
      .orders.map(clone)
      .sort(newestFirst)
      .slice(0, limit);
  },

  async create(input) {
    await simulateLatency(180);

    /**
     * The whole sale is one atomic write. `mutate` restores the previous
     * document if anything below throws, so a stock shortfall leaves no receipt
     * behind and no stock moved — the only safe outcome for a partial sale.
     */
    return mutate((db) => {
      const lines = buildLines(db, input);

      const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      const taxAmount = calculateTax(subtotal, TAX_RATE_DEFAULT);
      const total = roundIDR(subtotal + taxAmount);

      const receiptNo = `MOKA-${db.counters.receipt}`;
      const order: Order = {
        id: `o-${db.counters.receipt}`,
        receiptNo,
        lines,
        subtotal,
        taxRate: TAX_RATE_DEFAULT,
        taxAmount,
        total,
        paymentMethod: input.paymentMethod,
        paidAmount: input.paidAmount,
        changeAmount: input.paidAmount - total,
        cashierId: input.cashier.id,
        cashierName: input.cashier.name,
        customer: normaliseCustomer(input),
        createdAt: new Date().toISOString(),
      };

      db.counters.receipt += 1;

      /**
       * Stock is consumed before the document is persisted, so a shortfall
       * throws with the whole write already rolled back.
       */
      const movements = applySale(db, lines, input.cashier, receiptNo);

      db.orders.unshift(order);
      return { order: clone(order), movements: movements.map(clone) };
    });
  },
};