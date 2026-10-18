"use client";

import type { Repositories } from "@/lib/repositories/types";
import {
  categoryRepository,
  ingredientRepository,
  productRepository,
  userRepository,
} from "./http/catalog";
import {
  orderRepository,
  shiftRepository,
  stockRepository,
} from "./http/commerce";

/**
 * The seam.
 *
 * Screens call `getRepositories()` and never import a repository module
 * directly, so this object is the only place that names an implementation.
 *
 * The seven mock imports below were replaced by the seven HTTP ones, and this
 * file was the only one changed. The mock is still on disk at `./mock/*` — kept
 * because it is the fastest way to work on a screen without a database running,
 * and because `npm run smoke` can be pointed at either.
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