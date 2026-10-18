"use client";

import { mutate, readDb } from "@/lib/repositories/mock/db";
import { clone, simulateLatency, slugify, uniqueId } from "@/lib/repositories/mock/helpers";
import type { ProductInput, ProductRepository } from "@/lib/repositories/types";
import type { Product } from "@/types/pos";

/**
 * Opening stock is carried by the product record on create, because there is no
 * ingredient ledger to route it through. Later changes go through
 * `stockRepository.adjust` so they are always audited.
 */

/** Drops the fields that do not belong to the product's stock mode. */
function normalise(input: ProductInput, id: string): Product {
  const base = {
    id,
    name: input.name,
    categoryId: input.categoryId,
    price: input.price,
    image: input.image,
    stockMode: input.stockMode,
    isActive: input.isActive,
  };

  if (input.stockMode === "direct") {
    return {
      ...base,
      stock: input.stock ?? 0,
      minStock: input.minStock ?? 0,
      recipe: [],
    };
  }

  return { ...base, recipe: input.recipe.map((r) => ({ ...r })) };
}

export const productRepository: ProductRepository = {
  async list(query = {}) {
    await simulateLatency(200);
    const { includeInactive = false, categoryId, search } = query;
    const needle = search?.trim().toLowerCase();

    return readDb()
      .products.map(clone)
      .filter((product) => {
        if (!includeInactive && !product.isActive) return false;
        if (categoryId && product.categoryId !== categoryId) return false;
        if (needle && !product.name.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getById(id) {
    const product = readDb().products.find((p) => p.id === id);
    return product ? clone(product) : undefined;
  },

  async create(input) {
    await simulateLatency();
    return mutate((db) => {
      const taken = new Set(db.products.map((p) => p.id));
      const product = normalise(
        input,
        uniqueId(slugify(input.name) || "product", taken),
      );

      db.products.push(product);
      return clone(product);
    });
  },

  async update(id, input) {
    await simulateLatency();
    return mutate((db) => {
      const index = db.products.findIndex((p) => p.id === id);
      if (index === -1) throw new Error("Product not found.");

      const updated = normalise(input, id);
      db.products[index] = updated;
      return clone(updated);
    });
  },

  async setActive(id, isActive) {
    await simulateLatency(120);
    return mutate((db) => {
      const product = db.products.find((p) => p.id === id);
      if (!product) throw new Error("Product not found.");

      product.isActive = isActive;
      return clone(product);
    });
  },

  async remove(id) {
    await simulateLatency(120);
    mutate((db) => {
      const index = db.products.findIndex((p) => p.id === id);
      if (index === -1) throw new Error("Product not found.");

      /**
       * A hard delete is safe here precisely because order lines denormalise
       * their name and price at the moment of sale: a receipt for a deleted
       * product still prints what was actually charged, and reprinting it years
       * later still matches. The one thing that did have to keep working is the
       * category split in reports, which routes an unresolvable product to
       * "Uncategorised" rather than dropping its revenue.
       *
       * Hiding a product for a season is `setActive`; this is the terminal one.
       */
      db.products.splice(index, 1);
    });
  },
};