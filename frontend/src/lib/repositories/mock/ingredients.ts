"use client";

import { mutate, readDb } from "@/lib/repositories/mock/db";
import { clone, simulateLatency, slugify, uniqueId } from "@/lib/repositories/mock/helpers";
import type { IngredientRepository } from "@/lib/repositories/types";
import type { Ingredient } from "@/types/pos";

/**
 * Stock levels themselves change through `stockRepository.adjust`, so this
 * repository only owns the ingredient record itself: the name, unit, reorder
 * threshold, and unit cost.
 *
 * Opening stock is entered the same way any other change is, which keeps a
 * single path writing `stock` and guarantees a ledger entry for every unit.
 */
export const ingredientRepository: IngredientRepository = {
  async list() {
    await simulateLatency(140);
    return readDb()
      .ingredients.map(clone)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getById(id) {
    const ingredient = readDb().ingredients.find((i) => i.id === id);
    return ingredient ? clone(ingredient) : undefined;
  },

  async create(input) {
    await simulateLatency();
    return mutate((db) => {
      const taken = new Set(db.ingredients.map((i) => i.id));
      const ingredient: Ingredient = {
        id: uniqueId(slugify(input.name) || "ingredient", taken),
        name: input.name,
        unit: input.unit,
        minStock: input.minStock,
        costPerUnit: input.costPerUnit,
        // Starts at zero so the first movement records the opening stock.
        stock: 0,
      };

      db.ingredients.push(ingredient);
      return clone(ingredient);
    });
  },

  async update(id, input) {
    await simulateLatency();
    return mutate((db) => {
      const ingredient = db.ingredients.find((i) => i.id === id);
      if (!ingredient) throw new Error("Ingredient not found.");

      // A rename must not orphan the recipe rows that reference this id.
      ingredient.name = input.name;
      ingredient.unit = input.unit;
      ingredient.minStock = input.minStock;
      ingredient.costPerUnit = input.costPerUnit;
      return clone(ingredient);
    });
  },
};