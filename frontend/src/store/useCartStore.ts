"use client";

import { create } from "zustand";
import {
  calculateTax,
  remainingFor,
  TAX_RATE_DEFAULT,
  type Ingredient,
  type Product,
  type StockMode,
} from "@/types/pos";

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
  stockMode: StockMode;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

/**
 * The stock a cart action is measured against.
 *
 * The cart cannot derive a limit from its own lines, so the caller — the only
 * thing holding the product and ingredient tables — passes the number in. Doing
 * it this way rather than storing the tables in here keeps a stale snapshot out
 * of a money-handling reducer: `limit` is always computed from the same render
 * that drew the tiles the cashier just tapped.
 */
export interface CartStockContext {
  products: ReadonlyMap<string, Product>;
  ingredients: ReadonlyMap<string, Ingredient>;
}

/**
 * How many of `product` the cart can still hold, given every other line it
 * already contains.
 *
 * Exported so the POS screen can build the whole map of limits in one pass and
 * hand the same numbers to the grid, the cart, and the reducer, instead of each
 * of them asking again and getting a subtly different answer.
 */
export function cartLimit(
  lines: CartLine[],
  product: Product,
  stock: CartStockContext,
): number | null {
  const others: Array<{ product: Product; qty: number }> = [];

  for (const line of lines) {
    if (line.productId === product.id) continue;
    const other = stock.products.get(line.productId);
    if (other) others.push({ product: other, qty: line.qty });
  }

  return remainingFor(product, stock.ingredients, others);
}

/** `limit` of null means nothing bounds the product, so the wish stands. */
function cap(qty: number, limit: number | null): number {
  if (limit === null) return qty;
  return Math.min(qty, limit);
}

interface CartState {
  lines: CartLine[];
  taxRate: number;
  /**
   * `limit` is the number of units of this product the remaining stock supports,
   * counting only what the rest of the cart has already claimed. Passing it in
   * rather than letting the store work it out is deliberate: a reducer that
   * guessed its own limit is how a till oversells and only finds out at save
   * time, after the money has changed hands.
   */
  add: (product: Product, qty: number, limit: number | null) => void;
  setQty: (productId: string, qty: number, limit: number | null) => void;
  remove: (productId: string) => void;
  clear: () => void;
  qtyOf: (productId: string) => number;
  totals: () => CartTotals;
}

function computeTotals(lines: CartLine[], taxRate: number): CartTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const taxAmount = calculateTax(subtotal, taxRate);

  return {
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    subtotal,
    taxAmount,
    total: subtotal + taxAmount,
  };
}

export const useCartStore = create<CartState>()((set, get) => ({
  lines: [],
  taxRate: TAX_RATE_DEFAULT,

  add: (product, qty, limit) =>
    set((state) => {
      const existing = state.lines.find((l) => l.productId === product.id);
      const wanted = (existing?.qty ?? 0) + qty;
      const next = cap(wanted, limit);

      /**
       * Nothing left to add. Returning the state object untouched rather than
       * writing an equal copy keeps this from re-rendering every subscriber for
       * a tap the grid should have prevented anyway.
       */
      if (next <= 0) return state;

      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.productId === product.id ? { ...l, qty: next } : l,
          ),
        };
      }

      return {
        lines: [
          ...state.lines,
          {
            productId: product.id,
            name: product.name,
            price: product.price,
            qty: next,
            stockMode: product.stockMode,
          },
        ],
      };
    }),

  setQty: (productId, qty, limit) =>
    set((state) => {
      const next = cap(qty, limit);

      return {
        lines:
          next <= 0
            ? state.lines.filter((l) => l.productId !== productId)
            : state.lines.map((l) =>
                l.productId === productId ? { ...l, qty: next } : l,
              ),
      };
    }),

  remove: (productId) =>
    set((state) => ({
      lines: state.lines.filter((l) => l.productId !== productId),
    })),

  clear: () => set({ lines: [] }),

  qtyOf: (productId) =>
    get().lines.find((l) => l.productId === productId)?.qty ?? 0,

  totals: () => computeTotals(get().lines, get().taxRate),
}));

export { computeTotals };