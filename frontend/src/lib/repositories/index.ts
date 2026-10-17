"use client";

import { categoryRepository } from "@/lib/repositories/mock/categories";
import { ingredientRepository } from "@/lib/repositories/mock/ingredients";
import { orderRepository } from "@/lib/repositories/mock/orders";
import { productRepository } from "@/lib/repositories/mock/products";
import { shiftRepository } from "@/lib/repositories/mock/shifts";
import { stockRepository } from "@/lib/repositories/mock/stock";
import { userRepository } from "@/lib/repositories/mock/users";
import type { Repositories } from "@/lib/repositories/types";

/**
 * The seam.
 *
 * Screens call `getRepositories()` and never import a repository module
 * directly, so this object is the only place that names an implementation. When
 * the Express API exists, the seven imports below are the only lines that
 * change: the interfaces in `./types` are already written for a network call.
 *
 * Returned as a frozen singleton because every repository shares one backing
 * store, and handing out a fresh object per call would invite screens holding
 * inconsistent references.
 */
let instance: Repositories | null = null;

export function getRepositories(): Repositories {
  instance ??= Object.freeze({
    categories: categoryRepository,
    ingredients: ingredientRepository,
    products: productRepository,
    stock: stockRepository,
    users: userRepository,
    orders: orderRepository,
    shifts: shiftRepository,
  });

  return instance;
}

export type {
  Repositories,
  CategoryRepository,
  IngredientRepository,
  ProductRepository,
  StockRepository,
  UserRepository,
  OrderRepository,
  ShiftRepository,
} from "@/lib/repositories/types";