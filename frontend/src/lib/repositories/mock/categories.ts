"use client";

import { mutate, readDb } from "@/lib/repositories/mock/db";
import { clone, simulateLatency, slugify, uniqueId } from "@/lib/repositories/mock/helpers";
import type { CategoryRepository } from "@/lib/repositories/types";
import type { Category } from "@/types/pos";

function bySortOrder(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export const categoryRepository: CategoryRepository = {
  async list() {
    await simulateLatency(120);
    return readDb().categories.map(clone).sort(bySortOrder);
  },

  async create(input) {
    await simulateLatency();
    return mutate((db) => {
      const taken = new Set(db.categories.map((c) => c.id));
      const category: Category = {
        id: uniqueId(slugify(input.name) || "category", taken),
        name: input.name,
        // New categories land at the end of the display order.
        sortOrder:
          input.sortOrder ??
          db.categories.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1,
      };

      db.categories.push(category);
      return clone(category);
    });
  },

  async update(id, input) {
    await simulateLatency();
    return mutate((db) => {
      const category = db.categories.find((c) => c.id === id);
      if (!category) throw new Error("Category not found.");

      category.name = input.name;
      if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;
      return clone(category);
    });
  },

  async remove(id) {
    await simulateLatency();
    mutate((db) => {
      const inUse = db.products.some((p) => p.categoryId === id);
      if (inUse) {
        throw new Error("Move or archive the products in this category first.");
      }

      const index = db.categories.findIndex((c) => c.id === id);
      if (index === -1) throw new Error("Category not found.");
      db.categories.splice(index, 1);
    });
  },

  async reorder(orderedIds) {
    await simulateLatency();
    return mutate((db) => {
      orderedIds.forEach((id, index) => {
        const category = db.categories.find((c) => c.id === id);
        if (category) category.sortOrder = index + 1;
      });

      return db.categories.map(clone).sort(bySortOrder);
    });
  },
};