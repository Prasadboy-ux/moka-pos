import type { Database } from "@/lib/repositories/types";
import type { StoredUser } from "@/types/auth";
import type {
  Category,
  Ingredient,
  Order,
  OrderLine,
  PaymentMethod,
  Product,
} from "@/types/pos";

/**
 * Fixtures the mock store starts from.
 *
 * Deterministic on purpose: the same seed means a demo, a screenshot, and a bug
 * report all show the same numbers. `buildHistory` uses a fixed PRNG seed for
 * the same reason.
 */

/**
 * PRICES ARE PLACEHOLDERS. Replace this flag with the real price block when
 * pricing is confirmed.
 */
const PLACEHOLDER_PRICES = true;

export const SEED_CATEGORIES: Category[] = [
  { id: "c-coffee", name: "Coffee", sortOrder: 1 },
  { id: "c-noncoffee", name: "Non Coffee", sortOrder: 2 },
  { id: "c-snack", name: "Snack", sortOrder: 3 },
  { id: "c-retail", name: "Retail", sortOrder: 4 },
];

/**
 * Ingredients are the recipe inputs only. Packaged goods are `direct` products
 * carrying their own stock, so listing them here too would double-count them on
 * the stock screen.
 *
 * `costPerUnit` is rupiah for ONE unit — a single gram or a single millilitre —
 * because that is what a recipe multiplies. A 250 g bag of beans at Rp 95.000 is
 * therefore 380 per gram. These are placeholders like the selling prices above;
 * replace them once supplier invoices are confirmed.
 */
export const SEED_INGREDIENTS: Ingredient[] = [
  {
    id: "i-bean-house",
    name: "House Blend Beans",
    unit: "gram",
    stock: 4200,
    minStock: 1500,
    costPerUnit: 380,
  },
  {
    id: "i-milk-fresh",
    name: "Fresh Milk",
    unit: "ml",
    stock: 6200,
    minStock: 2000,
    costPerUnit: 16,
  },
  {
    id: "i-sugar",
    name: "Sugar Syrup",
    unit: "ml",
    stock: 3100,
    minStock: 800,
    costPerUnit: 4,
  },
  {
    id: "i-chocolate",
    name: "Chocolate Sauce",
    unit: "ml",
    stock: 1400,
    minStock: 500,
    costPerUnit: 12,
  },
  {
    id: "i-caramel",
    name: "Caramel Sauce",
    unit: "ml",
    stock: 260,
    minStock: 300,
    costPerUnit: 15,
  },
  {
    id: "i-brown-sugar",
    name: "Brown Sugar Syrup",
    unit: "ml",
    stock: 1200,
    minStock: 400,
    costPerUnit: 5,
  },
  {
    id: "i-tea",
    name: "Black Tea Leaves",
    unit: "gram",
    stock: 760,
    minStock: 300,
    costPerUnit: 2,
  },
  {
    id: "i-boba",
    name: "Boba Pearls",
    unit: "gram",
    stock: 800,
    minStock: 300,
    costPerUnit: 3,
  },
  {
    id: "i-ice",
    name: "Ice Cubes",
    unit: "gram",
    stock: 9000,
    minStock: 3000,
    costPerUnit: 0.2,
  },
  {
    id: "i-lemon",
    name: "Lemon Juice",
    unit: "ml",
    stock: 190,
    minStock: 200,
    costPerUnit: 6,
  },
];

/**
 * Every product maps 1:1 to an illustration in `public/menu/`.
 *
 * Drinks (`recipe`) consume ingredients; packaged goods and merchandise
 * (`direct`) are counted themselves.
 */
export const SEED_PRODUCTS: Product[] = [
  // ---------------------------------------------------------------- Coffee
  {
    id: "p-iced-latte",
    name: "Classic Iced Caffe Latte",
    categoryId: "c-coffee",
    price: PLACEHOLDER_PRICES ? 28000 : 0,
    image: "/menu/coffee/classic_iced_latte.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-milk-fresh", qty: 180 },
      { ingredientId: "i-ice", qty: 80 },
    ],
    isActive: true,
  },
  {
    id: "p-iced-americano",
    name: "Iced Americano",
    categoryId: "c-coffee",
    price: PLACEHOLDER_PRICES ? 26000 : 0,
    image: "/menu/coffee/iced_americano.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-ice", qty: 100 },
    ],
    isActive: true,
  },
  {
    id: "p-cold-foam-cappuccino",
    name: "Iced Cold Foam Cappuccino",
    categoryId: "c-coffee",
    price: PLACEHOLDER_PRICES ? 32000 : 0,
    image: "/menu/coffee/iced_cold_foam_cappuccino.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-milk-fresh", qty: 160 },
      { ingredientId: "i-ice", qty: 60 },
    ],
    isActive: true,
  },

  // ------------------------------------------------------------ Non Coffee
  {
    id: "p-brown-sugar-boba",
    name: "Brown Sugar Boba Milk",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 30000 : 0,
    image: "/menu/non-coffee/brown_sugar_boba_milk.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-tea", qty: 3 },
      { ingredientId: "i-brown-sugar", qty: 30 },
      { ingredientId: "i-milk-fresh", qty: 180 },
      { ingredientId: "i-boba", qty: 50 },
      { ingredientId: "i-ice", qty: 100 },
    ],
    isActive: true,
  },
  {
    id: "p-boba-frappe",
    name: "Boba Milk Tea Frappe",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 30000 : 0,
    image: "/menu/non-coffee/boba_milk_tea_frappe.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-tea", qty: 3 },
      { ingredientId: "i-milk-fresh", qty: 200 },
      { ingredientId: "i-boba", qty: 50 },
      { ingredientId: "i-ice", qty: 120 },
    ],
    isActive: true,
  },
  {
    id: "p-caramel-macchiato",
    name: "Iced Caramel Macchiato",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 32000 : 0,
    image: "/menu/non-coffee/iced_caramel_macchiato.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-milk-fresh", qty: 200 },
      { ingredientId: "i-caramel", qty: 30 },
      { ingredientId: "i-ice", qty: 80 },
    ],
    isActive: true,
  },
  {
    id: "p-mocha-frappe",
    name: "Iced Mocha Frappe",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 34000 : 0,
    image: "/menu/non-coffee/iced_mocha_frappe.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-bean-house", qty: 18 },
      { ingredientId: "i-chocolate", qty: 35 },
      { ingredientId: "i-milk-fresh", qty: 180 },
      { ingredientId: "i-ice", qty: 120 },
    ],
    isActive: true,
  },
  {
    id: "p-iced-lemon-tea",
    name: "Iced Lemon Tea",
    categoryId: "c-noncoffee",
    price: PLACEHOLDER_PRICES ? 18000 : 0,
    image: "/menu/non-coffee/iced_lemon_tea.svg",
    stockMode: "recipe",
    recipe: [
      { ingredientId: "i-tea", qty: 3 },
      { ingredientId: "i-lemon", qty: 40 },
      { ingredientId: "i-sugar", qty: 25 },
      { ingredientId: "i-ice", qty: 150 },
    ],
    isActive: true,
  },

  // ----------------------------------------------------------------- Snack
  {
    id: "p-avocado-toast",
    name: "Avocado Toast",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 32000 : 0,
    image: "/menu/snack/avocado_toast.svg",
    stockMode: "direct",
    stock: 6,
    minStock: 8,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-basque-cheesecake",
    name: "Basque Cheesecake",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 28000 : 0,
    image: "/menu/snack/basque_cheesecake.svg",
    stockMode: "direct",
    stock: 4,
    minStock: 6,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-butter-croissant",
    name: "Butter Croissant",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 22000 : 0,
    image: "/menu/snack/butter_croissant.svg",
    stockMode: "direct",
    stock: 9,
    minStock: 12,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-choco-chip-cookie",
    name: "Chocolate Chip Cookie",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 12000 : 0,
    image: "/menu/snack/chocolate_chip_cookie.svg",
    stockMode: "direct",
    stock: 3,
    minStock: 15,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-cinnamon-roll",
    name: "Cinnamon Roll",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 24000 : 0,
    image: "/menu/snack/cinnamon_roll.svg",
    stockMode: "direct",
    stock: 7,
    minStock: 8,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-fudge-brownie",
    name: "Fudge Brownie",
    categoryId: "c-snack",
    price: PLACEHOLDER_PRICES ? 26000 : 0,
    image: "/menu/snack/fudge_brownie.svg",
    stockMode: "direct",
    stock: 5,
    minStock: 8,
    recipe: [],
    isActive: true,
  },

  // ---------------------------------------------------------------- Retail
  {
    id: "p-ceramic-mug",
    name: "Ceramic Mug",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 65000 : 0,
    image: "/menu/retail/ceramic_mug.svg",
    stockMode: "direct",
    stock: 5,
    minStock: 6,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-bean-bag",
    name: "Coffee Bean Bag 250g",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 95000 : 0,
    image: "/menu/retail/coffee_bean_bag.svg",
    stockMode: "direct",
    stock: 12,
    minStock: 6,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-mineral-water",
    name: "Mineral Water",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 5000 : 0,
    image: "/menu/retail/mineral_water.svg",
    stockMode: "direct",
    stock: 36,
    minStock: 24,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-paper-filters",
    name: "Paper Filters",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 35000 : 0,
    image: "/menu/retail/paper_filters.svg",
    stockMode: "direct",
    stock: 2,
    minStock: 8,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-pour-over-carafe",
    name: "Pour-Over Carafe",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 180000 : 0,
    image: "/menu/retail/pour_over_carafe.svg",
    stockMode: "direct",
    stock: 3,
    minStock: 4,
    recipe: [],
    isActive: true,
  },
  {
    id: "p-travel-tumbler",
    name: "Travel Tumbler",
    categoryId: "c-retail",
    price: PLACEHOLDER_PRICES ? 120000 : 0,
    image: "/menu/retail/travel_tumbler.svg",
    stockMode: "direct",
    stock: 6,
    minStock: 5,
    recipe: [],
    isActive: true,
  },
];

export const SEED_USERS: StoredUser[] = [
  {
    id: "u-1",
    name: "Budi Santoso",
    username: "admin",
    password: "admin123",
    role: "admin",
    isActive: true,
  },
  {
    id: "u-2",
    name: "Siti Rahayu",
    username: "kasir",
    password: "kasir123",
    role: "kasir",
    isActive: true,
  },
  {
    id: "u-3",
    name: "Andi Wijaya",
    username: "kasir2",
    password: "kasir123",
    role: "kasir",
    isActive: false,
  },
];

const HISTORY_CASHIERS = [
  { id: "u-2", name: "Siti Rahayu" },
  { id: "u-3", name: "Andi Wijaya" },
] as const;

const PAYMENT_MIX: PaymentMethod[] = [
  "qris",
  "qris",
  "cash",
  "cash",
  "cash",
  "debit",
  "credit",
];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Thirty days of trading so the dashboard and reports have real numbers to
 * aggregate. Deterministic, weekend-weighted, and never lands a sale in the
 * future.
 *
 * Thirty rather than seven: the reports screen compares each range with the one
 * before it, and with only a week of history the default seven-day view has
 * nothing to compare against and reports "no comparable period" on every card.
 */
function buildHistory(products: Product[], taxRate: number): Order[] {
  const rand = mulberry32(20261017);
  const sellable = products.filter((p) => p.isActive);
  const orders: Order[] = [];
  const now = Date.now();

  const HISTORY_DAYS = 30;
  let receiptCounter = 1000;

  for (let dayOffset = HISTORY_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - dayOffset);

    const weekday = dayStart.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const orderCount = Math.round(
      (isWeekend ? 34 : 24) * (0.7 + rand() * 0.4) * (1 - dayOffset * 0.02),
    );

    for (let i = 0; i < orderCount; i++) {
      const lineCount = 1 + Math.floor(rand() * 3);
      const lines: OrderLine[] = [];

      for (let l = 0; l < lineCount; l++) {
        const product = sellable[Math.floor(rand() * sellable.length)];
        if (!product) continue;
        if (lines.some((line) => line.productId === product.id)) continue;
        lines.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: 1 + Math.floor(rand() * 2),
          stockMode: product.stockMode,
        });
      }

      if (lines.length === 0) continue;

      const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      const taxAmount = Math.round(subtotal * taxRate);
      const total = subtotal + taxAmount;

      const cashier = HISTORY_CASHIERS[Math.floor(rand() * HISTORY_CASHIERS.length)];
      const method = PAYMENT_MIX[Math.floor(rand() * PAYMENT_MIX.length)];

      if (!cashier || !method) continue;

      const createdAt = new Date(dayStart);
      createdAt.setHours(8 + Math.floor(rand() * 13), Math.floor(rand() * 60), 0, 0);

      if (createdAt.getTime() > now) continue;

      receiptCounter += 1;

      const paidAmount =
        method === "cash" ? Math.ceil(total / 5000) * 5000 : total;

      orders.push({
        id: `o-${receiptCounter}`,
        receiptNo: `MOKA-${receiptCounter}`,
        lines,
        subtotal,
        taxRate,
        taxAmount,
        total,
        paymentMethod: method,
        paidAmount,
        changeAmount: paidAmount - total,
        cashierId: cashier.id,
        cashierName: cashier.name,
        createdAt: createdAt.toISOString(),
      });
    }
  }

  return orders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Bump this whenever the shape above changes. The store compares it against
 * what is in `localStorage` and reseeds on a mismatch, so a schema change never
 * has to be migrated by hand.
 *
 * 2 — ingredient `costPerUnit` restated as rupiah per single ml/gram. Version 1
 * held per-kilogram figures, which made every recipe cost read as a rounding
 * error and every margin as 100%.
 * 3 — seeded history extended from 7 days to 30, so the reports screen has a
 * previous period to compare against.
 */
export const DB_VERSION = 3;

export function buildSeed(): Database {
  const orders = buildHistory(SEED_PRODUCTS, 0.1);

  return {
    version: DB_VERSION,
    categories: SEED_CATEGORIES.map((c) => ({ ...c })),
    ingredients: SEED_INGREDIENTS.map((i) => ({ ...i })),
    products: SEED_PRODUCTS.map((p) => ({ ...p, recipe: [...p.recipe] })),
    users: SEED_USERS.map((u) => ({ ...u })),
    orders,
    movements: [],
    shifts: [],
    counters: {
      receipt: 2000 + orders.length + 1,
      movement: 1,
    },
  };
}