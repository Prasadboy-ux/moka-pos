"use client";

import { mutate, readDb } from "@/lib/repositories/mock/db";
import { clone, simulateLatency } from "@/lib/repositories/mock/helpers";
import type { Database, StockRepository } from "@/lib/repositories/types";
import type { Product, StockMovement } from "@/types/pos";

/**
 * The single writer for stock numbers.
 *
 * Nothing else assigns to `ingredient.stock` or `product.stock`. Every change
 * lands here, which is what makes the movement ledger a complete history rather
 * than a log that can quietly fall out of step with the levels.
 */

function recordMovement(
  db: Database,
  movement: Omit<StockMovement, "id" | "createdAt">,
): StockMovement {
  const entry: StockMovement = {
    id: `mv-${db.counters.movement}`,
    createdAt: new Date().toISOString(),
    ...movement,
  };

  db.counters.movement += 1;
  // Newest first, which is the order every screen reads them in.
  db.movements.unshift(entry);
  return entry;
}

export { recordMovement };

/**
 * Opening level for a newly created direct product.
 *
 * The HTTP path takes the actor from the session. The mock has no session, so
 * the opening row is attributed to a system actor rather than letting the
 * ledger start without one.
 */
export function recordOpeningStock(
  db: Database,
  product: Product,
  qty: number,
): StockMovement | null {
  if (product.stockMode !== "direct") return null;

  product.stock = qty;
  if (qty === 0) return null;

  return recordMovement(db, {
    type: "purchase",
    ingredientId: null,
    productId: product.id,
    label: product.name,
    qty,
    unit: "pcs",
    note: "Opening stock",
    byUserId: "system",
    byUserName: "System",
  });
}

/**
 * Consumes stock for a set of sold lines and writes the matching ledger rows.
 *
 * Called inside the same `mutate` as the order write, so a sale either takes
 * stock and records the sale, or neither happens.
 *
 * Throws when a line cannot be covered. The order is written first inside the
 * caller's transaction, so the caller must discard the whole document on a
 * throw — `mutate` cannot roll back on its own.
 */
export function applySale(
  db: Database,
  lines: ReadonlyArray<{ productId: string; qty: number }>,
  cashier: { id: string; name: string },
  receiptNo: string,
): StockMovement[] {
  const movements: StockMovement[] = [];

  for (const line of lines) {
    const product = db.products.find((p) => p.id === line.productId);
    if (!product) throw new Error(`Product ${line.productId} no longer exists.`);

    if (product.stockMode === "direct") {
      const available = product.stock ?? 0;
      if (available < line.qty) {
        throw new Error(`${product.name} only has ${available} left.`);
      }

      product.stock = available - line.qty;
      movements.push(
        recordMovement(db, {
          type: "sale",
          ingredientId: null,
          productId: product.id,
          label: product.name,
          qty: -line.qty,
          unit: "pcs",
          note: `Sold on ${receiptNo}`,
          byUserId: cashier.id,
          byUserName: cashier.name,
        }),
      );
      continue;
    }

    for (const item of product.recipe) {
      const ingredient = db.ingredients.find((i) => i.id === item.ingredientId);
      if (!ingredient) {
        throw new Error(`Recipe for ${product.name} references a missing ingredient.`);
      }

      const needed = item.qty * line.qty;
      if (ingredient.stock < needed) {
        throw new Error(`${ingredient.name} is short for ${product.name}.`);
      }

      ingredient.stock -= needed;
      movements.push(
        recordMovement(db, {
          type: "sale",
          ingredientId: ingredient.id,
          productId: null,
          label: ingredient.name,
          qty: -needed,
          unit: ingredient.unit,
          note: `Sold on ${receiptNo}`,
          byUserId: cashier.id,
          byUserName: cashier.name,
        }),
      );
    }
  }

  return movements;
}

export const stockRepository: StockRepository = {
  async movements(filter = {}) {
    await simulateLatency(160);
    const { type, ingredientId, productId, limit = 200, offset = 0 } = filter;

    /**
     * The mock stores movements newest first (`unshift` on every write), so
     * the slice itself is the page.
     */
    const matching = readDb()
      .movements.map(clone)
      .filter((movement) => {
        if (type && movement.type !== type) return false;
        if (ingredientId && movement.ingredientId !== ingredientId) return false;
        if (productId && movement.productId !== productId) return false;
        return true;
      });

    return {
      data: matching.slice(offset, offset + limit),
      total: matching.length,
      limit,
      offset,
    };
  },

  async adjust(input) {
    await simulateLatency();
    return mutate((db) => {
      const actor = input.actor;

      if (input.target === "ingredient") {
        const ingredient = db.ingredients.find((i) => i.id === input.targetId);
        if (!ingredient) throw new Error("Ingredient not found.");

        const next = ingredient.stock + input.qty;
        if (next < 0) {
          throw new Error(
            `Cannot remove ${Math.abs(input.qty)} ${ingredient.unit}; only ${ingredient.stock} on hand.`,
          );
        }

        ingredient.stock = next;
        return clone(
          recordMovement(db, {
            type: input.type,
            ingredientId: ingredient.id,
            productId: null,
            label: ingredient.name,
            qty: input.qty,
            unit: ingredient.unit,
            note: input.note,
            byUserId: actor.id,
            byUserName: actor.name,
          }),
        );
      }

      const product = db.products.find((p) => p.id === input.targetId);
      if (!product) throw new Error("Product not found.");
      if (product.stockMode !== "direct") {
        throw new Error(`${product.name} is made from a recipe, so its stock moves through its ingredients.`);
      }

      const current = product.stock ?? 0;
      const next = current + input.qty;
      if (next < 0) {
        throw new Error(`Cannot remove ${Math.abs(input.qty)} pcs; only ${current} on hand.`);
      }

      product.stock = next;
      return clone(
        recordMovement(db, {
          type: input.type,
          ingredientId: null,
          productId: product.id,
          label: product.name,
          qty: input.qty,
          unit: "pcs",
          note: input.note,
          byUserId: actor.id,
          byUserName: actor.name,
        }),
      );
    });
  },

  async levelOf(target, id) {
    if (target === "ingredient") {
      return readDb().ingredients.find((i) => i.id === id)?.stock ?? null;
    }
    const product = readDb().products.find((p) => p.id === id);
    return product?.stockMode === "direct" ? (product.stock ?? null) : null;
  },

  async value() {
    const db = readDb();

    const ingredientsValue = db.ingredients.reduce(
      (sum, ingredient) => sum + ingredient.stock * ingredient.costPerUnit,
      0,
    );

    /**
     * Direct-stock items have no cost field on the model, so they are valued at
     * their selling price. That is retail value, not cost, and the stock screen
     * labels it as such rather than pretending the two are comparable.
     */
    const retailValue = db.products
      .filter((product) => product.stockMode === "direct")
      .reduce((sum, product) => sum + (product.stock ?? 0) * product.price, 0);

    return {
      ingredientsValue: Math.round(ingredientsValue),
      retailValue: Math.round(retailValue),
      total: Math.round(ingredientsValue + retailValue),
    };
  },
};