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

/**
 * Who the sale was for.
 *
 * Optional in every sense: most POS sales are a walk-in with no contact details,
 * and making the cashier type a phone number on every order would mean it never
 * gets typed at all. It exists so a receipt can be sent after the customer has
 * left, which is the part of "print or send" that does not need a server-side
 * gateway.
 */
export interface OrderCustomer {
  name: string;
  /**
   * Digits only, in international form without the plus — `6281234567890`.
   * Normalised on entry by `normalisePhone`, because a WhatsApp link built from
   * an un-normalised `+62 812-…` silently opens a chat with nobody.
   */
  phone: string;
  email: string | null;
}

/**
 * Reduces a typed phone number to the digits a wa.me link needs.
 *
 * Indonesian numbers are the awkward case: `+62 812-3456-7890` and
 * `0812 3456 7890` are the same subscriber, and WhatsApp only accepts the
 * international form. A leading `0` is rewritten to `62` rather than dropped,
 * because that prefix is still what most customers and staff actually type.
 *
 * Returns null for anything that cannot be a subscriber number, so the caller
 * can decline rather than build a link that opens nothing.
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 0) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  // A bare national number without the trunk prefix.
  if (digits.length >= 9 && digits.length <= 11) return `62${digits}`;

  return null;
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
  /** The shift it was rung under. Null on history from before shifts gated sales. */
  shiftId?: string | null;
  /** Null for a walk-in sale. */
  customer: OrderCustomer | null;
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
  /**
   * Reconciliation, filled in at close by the server: cash takings inside the
   * shift, `openingFloat + cashSales`, and `counted − expected` (negative is
   * short). Null while open. Optional so shifts written before reconciliation
   * existed still typecheck — treat missing as null.
   */
  cashSales?: number | null;
  expectedCash?: number | null;
  variance?: number | null;
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

/**
 * How many of this product can still be added to a cart that already holds
 * `others`.
 *
 * `maxServings` looks at the shelf alone, which is the right question for the
 * menu grid but the wrong one for the cart: two drinks sharing an espresso shot
 * both look fully stocked until one of them is in the order, and the shortfall
 * then surfaces as a failed sale after the customer has already handed over
 * cash. Counting what the rest of the cart has claimed on each shared ingredient
 * closes that window.
 *
 * `others` must exclude the line for this product — its own quantity is being
 * decided here, not spent against itself.
 *
 * Returns null when nothing bounds the product, which is the same "no model to
 * check against" answer `maxServings` gives.
 */
export function remainingFor(
  product: Product,
  ingredients: ReadonlyMap<string, Ingredient>,
  others: ReadonlyArray<{ product: Product; qty: number }>,
): number | null {
  if (product.stockMode === "direct") return product.stock ?? null;
  if (product.recipe.length === 0) return null;

  const claimed = new Map<string, number>();
  for (const line of others) {
    for (const item of line.product.recipe) {
      claimed.set(
        item.ingredientId,
        (claimed.get(item.ingredientId) ?? 0) + item.qty * line.qty,
      );
    }
  }

  return Math.min(
    ...product.recipe.map((item) => {
      const ingredient = ingredients.get(item.ingredientId);
      if (!ingredient || item.qty <= 0) return 0;
      return Math.floor((ingredient.stock - (claimed.get(item.ingredientId) ?? 0)) / item.qty);
    }),
  );
}