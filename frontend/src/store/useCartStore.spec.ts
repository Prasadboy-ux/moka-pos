import { beforeEach, describe, expect, it } from "vitest";
import {
  TAX_RATE_DEFAULT,
  type Ingredient,
  type Product,
} from "@/types/pos";
import { cartLimit, computeTotals, useCartStore } from "./useCartStore";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "water",
    name: "Mineral Water",
    categoryId: "retail",
    price: 5000,
    image: "/menu/retail/mineral_water.svg",
    stockMode: "direct",
    stock: 5,
    minStock: 2,
    recipe: [],
    isActive: true,
    ...overrides,
  };
}

const water = product();

const beans: Ingredient = {
  id: "beans",
  name: "Beans",
  unit: "gram",
  stock: 5000,
  minStock: 1000,
  costPerUnit: 380,
};

const milk: Ingredient = {
  id: "milk",
  name: "Milk",
  unit: "ml",
  stock: 1000,
  minStock: 2000,
  costPerUnit: 16,
};

const latte = product({
  id: "latte",
  name: "Latte",
  price: 28000,
  stockMode: "recipe",
  stock: undefined,
  minStock: undefined,
  recipe: [
    { ingredientId: "beans", qty: 18 },
    { ingredientId: "milk", qty: 180 },
  ],
});

const mocha = product({
  id: "mocha",
  name: "Mocha",
  price: 32000,
  stockMode: "recipe",
  stock: undefined,
  minStock: undefined,
  recipe: [
    { ingredientId: "beans", qty: 18 },
    { ingredientId: "milk", qty: 200 },
  ],
});

describe("computeTotals", () => {
  it("rounds tax to whole rupiah and adds it to the total", () => {
    expect(
      computeTotals(
        [
          { productId: "a", name: "A", price: 28000, qty: 1, stockMode: "recipe" },
          { productId: "b", name: "B", price: 5000, qty: 2, stockMode: "direct" },
        ],
        0.1,
      ),
    ).toEqual({
      itemCount: 3,
      subtotal: 38000,
      taxAmount: 3800,
      total: 41800,
    });
  });

  it("is empty, not NaN, with no lines", () => {
    expect(computeTotals([], 0.1)).toEqual({
      itemCount: 0,
      subtotal: 0,
      taxAmount: 0,
      total: 0,
    });
  });
});

describe("cartLimit", () => {
  const stock = {
    products: new Map([
      [latte.id, latte],
      [mocha.id, mocha],
      [water.id, water],
    ]),
    ingredients: new Map([
      [beans.id, beans],
      [milk.id, milk],
    ]),
  };

  it("returns the shelf count for a direct product", () => {
    expect(cartLimit([], water, stock)).toBe(5);
  });

  it("subtracts what the rest of the cart claims on a shared ingredient", () => {
    const lines = [
      {
        productId: latte.id,
        name: latte.name,
        price: latte.price,
        qty: 2,
        stockMode: "recipe" as const,
      },
    ];

    // Two lattes take 360 ml; the remaining 640 ml allows three mochas.
    expect(cartLimit(lines, mocha, stock)).toBe(3);
  });

  it("does not count the product's own line against itself", () => {
    const lines = [
      {
        productId: latte.id,
        name: latte.name,
        price: latte.price,
        qty: 4,
        stockMode: "recipe" as const,
      },
    ];

    expect(cartLimit(lines, latte, stock)).toBe(5);
  });
});

describe("useCartStore", () => {
  beforeEach(() => {
    useCartStore.setState({ lines: [], taxRate: TAX_RATE_DEFAULT });
  });

  it("caps an add at the limit the screen computed", () => {
    const store = useCartStore.getState();

    store.add(water, 3, 5);
    useCartStore.getState().add(water, 4, 5);

    expect(useCartStore.getState().qtyOf(water.id)).toBe(5);
    expect(useCartStore.getState().totals()).toMatchObject({
      itemCount: 5,
      subtotal: 25000,
      taxAmount: 2500,
      total: 27500,
    });
  });

  it("caps a quantity edit, and a zero removes the line", () => {
    useCartStore.getState().add(water, 2, 5);

    useCartStore.getState().setQty(water.id, 9, 3);
    expect(useCartStore.getState().qtyOf(water.id)).toBe(3);

    useCartStore.getState().setQty(water.id, 0, 3);
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("recomputes totals when the tax rate changes", () => {
    useCartStore.getState().add(water, 1, 5);
    useCartStore.getState().setTaxRate(0);

    expect(useCartStore.getState().totals()).toEqual({
      itemCount: 1,
      subtotal: 5000,
      taxAmount: 0,
      total: 5000,
    });
  });
});
