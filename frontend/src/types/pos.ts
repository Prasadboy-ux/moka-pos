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
  /** Sales are blocked and the item is flagged once stock drops to this. */
  minStock: number;
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

/** Ingredient shortfalls for a cart holding qty of a product. */
export function shortages(
  product: Product,
  ingredients: Map<string, Ingredient>,
  qty: number,
): Array<{ ingredient: Ingredient; needed: number }> {
  if (product.stockMode === "direct") return [];
  return product.recipe.flatMap((item) => {
    const ing = ingredients.get(item.ingredientId);
    if (!ing) return [];
    const needed = item.qty * qty;
    return ing.stock < needed ? [{ ingredient: ing, needed }] : [];
  });
}