"use client";

import { mutate, readDb } from "@/lib/repositories/mock/db";
import { configRepository } from "@/lib/repositories/mock/config";
import { clone, simulateLatency } from "@/lib/repositories/mock/helpers";
import { applySale, recordMovement } from "@/lib/repositories/mock/stock";
import type { CreateOrderInput, OrderRepository } from "@/lib/repositories/types";
import {
  calculateTax,
  normalisePhone,
  roundIDR,
  type Order,
  type OrderCustomer,
  type OrderLine,
  type StockMode,
  type StockMovement,
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
    const {
      cashierId,
      from,
      to,
      status,
      q,
      method,
      limit = 50,
      offset = 0,
    } = query;
    const fromTime = from ? new Date(from).getTime() : null;
    const toTime = to ? new Date(to).getTime() : null;
    const needle = q?.trim().toLowerCase() ?? "";

    const matching = readDb()
      .orders.map(clone)
      .filter((order) => {
        if (cashierId && order.cashierId !== cashierId) return false;
        if (status && order.status !== status) return false;
        if (method && order.paymentMethod !== method) return false;

        const at = new Date(order.createdAt).getTime();
        // `to` is a yyyy-mm-dd, so it lands at midnight; extend it to the end
        // of that day or a range ending today would silently drop every sale.
        if (fromTime !== null && at < fromTime) return false;
        if (toTime !== null && at > toTime + 86_399_999) return false;

        if (needle) {
          /**
           * The fields a customer quotes the sale back by. The phone only
           * matches when the needle has digits, mirroring the API — a text-only
           * needle against a phone number could not ever hit anything.
           */
          const hits =
            order.receiptNo.toLowerCase().includes(needle) ||
            (order.customer?.name.toLowerCase().includes(needle) ?? false) ||
            (/\d/.test(needle)
              ? (order.customer?.phone.includes(needle) ?? false)
              : false);
          if (!hits) return false;
        }

        return true;
      })
      .sort(newestFirst);

    return {
      data: matching.slice(offset, offset + limit),
      total: matching.length,
      limit,
      offset,
    };
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
     * The PPN rate must be the one the mock's own config serves, not a second
     * constant: a cart total built at a different rate than the receipt is
     * exactly the display-versus-charged drift the config repository exists
     * to close.
     */
    const { taxRate } = await configRepository.get();

    /**
     * The whole sale is one atomic write. `mutate` restores the previous
     * document if anything below throws, so a stock shortfall leaves no receipt
     * behind and no stock moved — the only safe outcome for a partial sale.
     */
    return mutate((db) => {
      const lines = buildLines(db, input);

      const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      const taxAmount = calculateTax(subtotal, taxRate);
      const total = roundIDR(subtotal + taxAmount);

      const receiptNo = `MOKA-${db.counters.receipt}`;
      const order: Order = {
        id: `o-${db.counters.receipt}`,
        receiptNo,
        lines,
        subtotal,
        taxRate,
        taxAmount,
        total,
        paymentMethod: input.paymentMethod,
        paidAmount: input.paidAmount,
        changeAmount: input.paidAmount - total,
        cashierId: input.cashier.id,
        cashierName: input.cashier.name,
        customer: normaliseCustomer(input),
        status: "paid",
        voidedAt: null,
        voidedByName: null,
        voidReason: "",
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

  async void(id, reason, actor) {
    await simulateLatency(160);

    /**
     * Mirror of the API's `voidOrder`: return what *today's* catalogue says
     * each line consumed where that is still expressible, warn about the rest,
     * and flip the receipt — all one atomic write.
     */
    return mutate((db) => {
      const order = db.orders.find((o) => o.id === id);
      if (!order) throw new Error("That receipt no longer exists.");
      if (order.status === "voided") {
        throw new Error(`${order.receiptNo} has already been voided.`);
      }

      const who = actor ?? { id: "system", name: "System" };
      const note = `Voided ${order.receiptNo} — ${reason}`.slice(0, 240);
      const movements: StockMovement[] = [];
      const warnings: string[] = [];

      const ingredientRestore = new Map<string, number>();

      for (const line of order.lines) {
        const product = db.products.find((p) => p.id === line.productId);

        if (!product) {
          warnings.push(
            `${line.name} was deleted since this sale, so its stock could not be restored.`,
          );
          continue;
        }
        if (product.stockMode !== line.stockMode) {
          warnings.push(
            `${line.name} changed stock mode since this sale, so its stock could not be restored.`,
          );
          continue;
        }

        if (line.stockMode === "direct") {
          product.stock = (product.stock ?? 0) + line.qty;
          movements.push(
            recordMovement(db, {
              type: "void",
              ingredientId: null,
              productId: product.id,
              label: line.name,
              qty: line.qty,
              unit: "pcs",
              note,
              byUserId: who.id,
              byUserName: who.name,
            }),
          );
          continue;
        }

        for (const item of product.recipe) {
          ingredientRestore.set(
            item.ingredientId,
            (ingredientRestore.get(item.ingredientId) ?? 0) + item.qty * line.qty,
          );
        }
      }

      for (const [ingredientId, qty] of ingredientRestore) {
        const ingredient = db.ingredients.find((i) => i.id === ingredientId);
        if (!ingredient) {
          warnings.push(
            "An ingredient in this recipe no longer exists, so its stock could not be restored.",
          );
          continue;
        }

        ingredient.stock += qty;
        movements.push(
          recordMovement(db, {
            type: "void",
            ingredientId: ingredient.id,
            productId: null,
            label: ingredient.name,
            qty,
            unit: ingredient.unit,
            note,
            byUserId: who.id,
            byUserName: who.name,
          }),
        );
      }

      order.status = "voided";
      order.voidedAt = new Date().toISOString();
      order.voidedByName = who.name;
      order.voidReason = reason;

      return { order: clone(order), movements: movements.map(clone), warnings };
    });
  },
};