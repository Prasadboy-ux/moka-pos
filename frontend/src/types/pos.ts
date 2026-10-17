export type Unit = "gram" | "ml" | "pcs";

export interface Category {
  id: string;
  name: string;
  /** Display order in the POS grid and product table. */
  sortOrder: number;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: Unit;
  stock: number;
  /**
   * Reorder threshold, not a sales block. Items stay sellable down to zero and
   * crossing this raises an admin alert. The backend must not reject a sale on
   * this number, or the till will refuse drinks the cafe would happily make.
   */
  minStock: number;
  /** Rupiah for ONE unit — a single gram or millilitre. Recipes multiply by qty. */
  costPerUnit: number;
}

/**
 * How a product consumes stock.
 *
 * - `recipe`: stock is derived from ingredients, so selling the item decrements
 *   each ingredient. Correct for made-to-order drinks.
 * - `direct`: the item itself is counted, so selling decrements the item. Correct
 *   for packaged goods like bottled water or retail coffee beans.
 */
export type StockMode = "recipe" | "direct";

export interface RecipeItem {
  ingredientId: string;
  qty: number;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  /**
   * Public path to the menu illustration, e.g. "/menu/coffee/iced_americano.svg".
   * Served as a plain <img>: next/image blocks SVG optimisation by default, and
   * these are trusted local assets.
   */
  image: string;
  stockMode: StockMode;
  /** Required when stockMode is `direct`. */
  stock?: number;
  minStock?: number;
  recipe: RecipeItem[];
  isActive: boolean;
}

export type PaymentMethod = "cash" | "qris" | "debit" | "credit";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  qris: "QRIS",
  debit: "Debit",
  credit: "Credit",
};

export interface OrderLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
  stockMode: StockMode;
}

export interface Order {
  id: string;
  /** Human-friendly receipt number, e.g. "MOKA-1042". */
  receiptNo: string;
  lines: OrderLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  /** Amount handed over. For non-cash this equals the total. */
  paidAmount: number;
  changeAmount: number;
  cashierId: string;
  cashierName: string;
  createdAt: string;
}

export type MovementType = "sale" | "purchase" | "adjustment" | "waste";

export interface StockMovement {
  id: string;
  type: MovementType;
  /** Set for ingredient movements, null for direct-stock products. */
  ingredientId: string | null;
  productId: string | null;
  label: string;
  /** Signed: negative consumes stock, positive adds it. */
  qty: number;
  unit: Unit | null;
  note: string;
  createdAt: string;
  byUserId: string;
  byUserName: string;
}

export type ShiftStatus = "open" | "closed";

export interface Shift {
  id: string;
  userId: string;
  userName: string;
  openedAt: string;
  openingFloat: number;
  closedAt: string | null;
  /** Cash counted at close. Null while the shift is open. */
  closingCounted: number | null;
  status: ShiftStatus;
}

export const TAX_RATE_DEFAULT = 0.1;

/** Rounds to whole rupiah; cash has no sub-unit in practice. */
export function roundIDR(value: number): number {
  return Math.round(value);
}

export function calculateTax(subtotal: number, rate: number): number {
  return roundIDR(subtotal * rate);
}

/** True when a recipe-driven product can still be sold qty times. */
export function canFulfill(
  product: Product,
  ingredients: Map<string, Ingredient>,
  qty = 1,
): boolean {
  if (product.stockMode === "direct") {
    return (product.stock ?? 0) >= qty;
  }
  return product.recipe.every((item) => {
    const ing = ingredients.get(item.ingredientId);
    return ing ? ing.stock >= item.qty * qty : false;
  });
}

/**
 * How many of this product the current stock can cover.
 *
 * A recipe item has no stock level of its own, so "stock" for a made-to-order
 * drink has to be expressed in servings: the binding ingredient sets the limit,
 * which is the only number an admin can act on when deciding what to reorder.
 *
 * Null when the product carries no stock model at all — a recipe with no rows,
 * which the form forbids but old data could still contain.
 */
export function maxServings(
  product: Product,
  ingredients: Map<string, Ingredient>,
): number | null {
  if (product.stockMode === "direct") return product.stock ?? null;
  if (product.recipe.length === 0) return null;

  return Math.min(
    ...product.recipe.map((item) => {
      const ingredient = ingredients.get(item.ingredientId);
      // An unresolvable ingredient means the recipe is broken, and pretending
      // there is stock would hide it. Treat it as nothing available.
      if (!ingredient || item.qty <= 0) return 0;
      return Math.floor(ingredient.stock / item.qty);
    }),
  );
}