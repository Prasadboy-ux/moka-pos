import type { Category, Ingredient } from "@/types/pos";

/**
 * Mock reference data for the cafe. Read-only fixtures: the POS needs a product
 * catalogue and ingredient levels, but writes belong to the API once it exists.
 *
 * Ingredient set matches the current menu. Arabica beans, oat milk, and milo
 * were dropped because no menu item uses them any more.
 */

export const CATEGORIES: Category[] = [
  { id: "c-coffee", name: "Coffee", sortOrder: 1 },
  { id: "c-noncoffee", name: "Non Coffee", sortOrder: 2 },
  { id: "c-snack", name: "Snack", sortOrder: 3 },
  { id: "c-retail", name: "Retail", sortOrder: 4 },
];

export const INGREDIENTS: Ingredient[] = [
  {
    id: "i-bean-house",
    name: "House Blend Beans",
    unit: "gram",
    stock: 4200,
    minStock: 1500,
    costPerUnit: 0.09,
  },
  {
    id: "i-milk-fresh",
    name: "Fresh Milk",
    unit: "ml",
    stock: 6200,
    minStock: 2000,
    costPerUnit: 0.012,
  },
  {
    id: "i-sugar",
    name: "Sugar Syrup",
    unit: "ml",
    stock: 3100,
    minStock: 800,
    costPerUnit: 0.006,
  },
  {
    id: "i-chocolate",
    name: "Chocolate Sauce",
    unit: "ml",
    stock: 1400,
    minStock: 500,
    costPerUnit: 0.014,
  },
  {
    id: "i-caramel",
    name: "Caramel Sauce",
    unit: "ml",
    stock: 260,
    minStock: 300,
    costPerUnit: 0.022,
  },
  {
    id: "i-brown-sugar",
    name: "Brown Sugar Syrup",
    unit: "ml",
    stock: 1200,
    minStock: 400,
    costPerUnit: 0.009,
  },
  {
    id: "i-tea",
    name: "Black Tea Leaves",
    unit: "gram",
    stock: 760,
    minStock: 300,
    costPerUnit: 0.05,
  },
  {
    id: "i-boba",
    name: "Boba Pearls",
    unit: "gram",
    stock: 800,
    minStock: 300,
    costPerUnit: 0.018,
  },
  {
    id: "i-ice",
    name: "Ice Cubes",
    unit: "gram",
    stock: 9000,
    minStock: 3000,
    costPerUnit: 0.002,
  },
  {
    id: "i-lemon",
    name: "Lemon Juice",
    unit: "ml",
    stock: 190,
    minStock: 200,
    costPerUnit: 0.02,
  },
];

/**
 * Packaged goods are deliberately absent here. They are sold as
 * `stockMode: "direct"` products carrying their own stock, so listing them as
 * ingredients too would double-count them on the inventory screen.
 */
export function isLowStock(ingredient: Ingredient): boolean {
  return ingredient.stock <= ingredient.minStock;
}