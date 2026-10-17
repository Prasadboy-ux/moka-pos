"use client";

import { create } from "zustand";
import {
  calculateTax,
  TAX_RATE_DEFAULT,
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

interface CartState {
  lines: CartLine[];
  taxRate: number;
  add: (product: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
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

  add: (product, qty = 1) =>
    set((state) => {
      const existing = state.lines.find((l) => l.productId === product.id);

      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.productId === product.id ? { ...l, qty: l.qty + qty } : l,
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
            qty,
            stockMode: product.stockMode,
          },
        ],
      };
    }),

  setQty: (productId, qty) =>
    set((state) => ({
      lines:
        qty <= 0
          ? state.lines.filter((l) => l.productId !== productId)
          : state.lines.map((l) =>
              l.productId === productId ? { ...l, qty } : l,
            ),
    })),

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