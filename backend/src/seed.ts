import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { Types } from 'mongoose';
import { env } from './config/env.js';
import { startOfDayUtc } from './lib/dates.js';
import { hashPassword } from './lib/password.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import {
  ALL_MODELS,
  CategoryModel,
  CounterModel,
  IngredientModel,
  OrderModel,
  ProductModel,
  ShiftModel,
  StockMovementModel,
  UserModel,
} from './models/index.js';

/**
 * Demo data, mirroring the frontend's mock store fixture.
 *
 * The point of mirroring is the swap: the 154-check smoke suite must pass
 * against this data without a single screen being edited. Same categories,
 * same ingredients, same products, same users, same thirty days of history, and
 * the same PRNG seed, so the numbers on the dashboard match the numbers the
 * mock produced.
 *
 * Dev/demo only. There is no migration path from seeded data to real data, so
 * do not point this at a production cluster.
 *
 * Known deviation from the contract: `stock_movements` is seeded empty, exactly
 * as the mock has it, so the stock ledger starts blank despite thirty days of
 * sales. Matching the mock keeps the smoke suite green. Closing that gap means
 * back-filling opening `purchase` movements and sale movements from the orders —
 * worth doing, but it changes what the stock screen shows, so it is a separate
 * change rather than something smuggled in here.
 */

const PLACEHOLDER_PRICES = true;

const SEED_CATEGORIES = [
  { key: 'c-coffee', name: 'Coffee', sortOrder: 1 },
  { key: 'c-noncoffee', name: 'Non Coffee', sortOrder: 2 },
  { key: 'c-snack', name: 'Snack', sortOrder: 3 },
  { key: 'c-retail', name: 'Retail', sortOrder: 4 },
] as const;

/** `costPerUnit` is rupiah for ONE gram or millilitre, not per bag. */
const SEED_INGREDIENTS = [
  {
    key: 'i-bean-house',
    name: 'House Blend Beans',
    unit: 'gram',
    stock: 4200,
    minStock: 1500,
    costPerUnit: 380,
  },
  {
    key: 'i-milk-fresh',
    name: 'Fresh Milk',
    unit: 'ml',
    stock: 6200,
    minStock: 2000,
    costPerUnit: 16,
  },
  {
    key: 'i-sugar',
    name: 'Sugar Syrup',
    unit: 'ml',
    stock: 3100,
    minStock: 800,
    costPerUnit: 4,
  },
  {
    key: 'i-chocolate',
    name: 'Chocolate Sauce',
    unit: 'ml',
    stock: 1400,
    minStock: 500,
    costPerUnit: 12,
  },
  {
    key: 'i-caramel',
    name: 'Caramel Sauce',
    unit: 'ml',
    stock: 260,
    minStock: 300,
    costPerUnit: 15,
  },
  {
    key: 'i-brown-sugar',
    name: 'Brown Sugar Syrup',
    unit: 'ml',
    stock: 1200,
    minStock: 400,
    costPerUnit: 5,
  },
  {
    key: 'i-tea',
    name: 'Black Tea Leaves',
    unit: 'gram',
    stock: 760,
    minStock: 300,
    costPerUnit: 2,
  },
  {
    key: 'i-boba',
    name: 'Boba Pearls',
    unit: 'gram',
    stock: 800,
    minStock: 300,
    costPerUnit: 3,
  },
  {
    key: 'i-ice',
    name: 'Ice Cubes',
    unit: 'gram',
    stock: 9000,
    minStock: 3000,
    costPerUnit: 0.2,
  },
  {
    key: 'i-lemon',
    name: 'Lemon Juice',
    unit: 'ml',
    stock: 190,
    minStock: 200,
    costPerUnit: 6,
  },
] as const;

type Recipe = readonly { readonly key: string; readonly qty: number }[];

const SEED_PRODUCTS: {
  name: string;
  category: string;
  price: number;
  image: string;
  mode: 'recipe' | 'direct';
  recipe?: Recipe;
  stock?: number;
  minStock?: number;
}[] = [
  {
    name: 'Classic Iced Caffe Latte',
    category: 'c-coffee',
    price: 28000,
    image: '/menu/coffee/classic_iced_latte.svg',
    mode: 'recipe',
    recipe: [
      { key: 'i-bean-house', qty: 18 },
      { key: 'i-milk-fresh', qty: 180 },
      { key: 'i-ice', qty: 80 },
    ],
  },
  {
    name: 'Iced Americano',
    category: 'c-coffee',
    price: 26000,
    image: '/menu/coffee/iced_americano.svg',
    mode: 'recipe',
    recipe: [
      { key: 'i-bean-house', qty: 18 },
      { key: 'i-ice', qty: 100 },
    ],
  },
  {
    name: 'Iced Cold Foam Cappuccino',
    category: 'c-coffee',
    price: 32000,
    image: '/menu/coffee/iced_cold_foam_cappuccino.svg',
    mode: 'recipe',
    recipe: [
      { key: 'i-bean-house', qty: 18 },
      { key: 'i-milk-fresh', qty: 160 },
      { key: 'i-ice', qty: 60 },
    ],
  },

  {
    name: 'Brown Sugar Boba Milk',
    category: 'c-noncoffee',
    price: 30000,
    image: '/menu/non-coffee/brown_sugar_boba_milk.svg',
    mode: 'recipe',
    recipe: [
      { key: 'i-tea', qty: 3 },
      { key: 'i-brown-sugar', qty: 30 },
      { key: 'i-milk-fresh', qty: 180 },
      { key: 'i-boba', qty: 50 },
      { key: 'i-ice', qty: 100 },
    ],
  },
  {
    name: 'Boba Milk Tea Frappe',
    category: 'c-noncoffee',
    price: 30000,
    image: '/menu/non-coffee/boba_milk_tea_frappe.svg',
    mode: 'recipe',
    recipe: [
      { key: 'i-tea', qty: 3 },
      { key: 'i-milk-fresh', qty: 200 },
      { key: 'i-boba', qty: 50 },
      { key: 'i-ice', qty: 120 },
    ],
  },
  {
    name: 'Iced Caramel Macchiato',
    category: 'c-noncoffee',
    price: 32000,
    image: '/menu/non-coffee/iced_caramel_macchiato.svg',
    mode: 'recipe',
    recipe: [
      { key: 'i-bean-house', qty: 18 },
      { key: 'i-milk-fresh', qty: 200 },
      { key: 'i-caramel', qty: 30 },
      { key: 'i-ice', qty: 80 },
    ],
  },
  {
    name: 'Iced Mocha Frappe',
    category: 'c-noncoffee',
    price: 34000,
    image: '/menu/non-coffee/iced_mocha_frappe.svg',
    mode: 'recipe',
    recipe: [
      { key: 'i-bean-house', qty: 18 },
      { key: 'i-chocolate', qty: 35 },
      { key: 'i-milk-fresh', qty: 180 },
      { key: 'i-ice', qty: 120 },
    ],
  },
  {
    name: 'Iced Lemon Tea',
    category: 'c-noncoffee',
    price: 18000,
    image: '/menu/non-coffee/iced_lemon_tea.svg',
    mode: 'recipe',
    recipe: [
      { key: 'i-tea', qty: 3 },
      { key: 'i-lemon', qty: 40 },
      { key: 'i-sugar', qty: 25 },
      { key: 'i-ice', qty: 150 },
    ],
  },

  {
    name: 'Avocado Toast',
    category: 'c-snack',
    price: 32000,
    image: '/menu/snack/avocado_toast.svg',
    mode: 'direct',
    stock: 6,
    minStock: 8,
  },
  {
    name: 'Basque Cheesecake',
    category: 'c-snack',
    price: 28000,
    image: '/menu/snack/basque_cheesecake.svg',
    mode: 'direct',
    stock: 4,
    minStock: 6,
  },
  {
    name: 'Butter Croissant',
    category: 'c-snack',
    price: 22000,
    image: '/menu/snack/butter_croissant.svg',
    mode: 'direct',
    stock: 9,
    minStock: 12,
  },
  {
    name: 'Chocolate Chip Cookie',
    category: 'c-snack',
    price: 12000,
    image: '/menu/snack/chocolate_chip_cookie.svg',
    mode: 'direct',
    stock: 3,
    minStock: 15,
  },
  {
    name: 'Cinnamon Roll',
    category: 'c-snack',
    price: 24000,
    image: '/menu/snack/cinnamon_roll.svg',
    mode: 'direct',
    stock: 7,
    minStock: 8,
  },
  {
    name: 'Fudge Brownie',
    category: 'c-snack',
    price: 26000,
    image: '/menu/snack/fudge_brownie.svg',
    mode: 'direct',
    stock: 5,
    minStock: 8,
  },

  {
    name: 'Ceramic Mug',
    category: 'c-retail',
    price: 65000,
    image: '/menu/retail/ceramic_mug.svg',
    mode: 'direct',
    stock: 5,
    minStock: 6,
  },
  {
    name: 'Coffee Bean Bag 250g',
    category: 'c-retail',
    price: 95000,
    image: '/menu/retail/coffee_bean_bag.svg',
    mode: 'direct',
    stock: 12,
    minStock: 6,
  },
  {
    name: 'Mineral Water',
    category: 'c-retail',
    price: 5000,
    image: '/menu/retail/mineral_water.svg',
    mode: 'direct',
    stock: 36,
    minStock: 24,
  },
  {
    name: 'Paper Filters',
    category: 'c-retail',
    price: 35000,
    image: '/menu/retail/paper_filters.svg',
    mode: 'direct',
    stock: 2,
    minStock: 8,
  },
  {
    name: 'Pour-Over Carafe',
    category: 'c-retail',
    price: 180000,
    image: '/menu/retail/pour_over_carafe.svg',
    mode: 'direct',
    stock: 3,
    minStock: 4,
  },
  {
    name: 'Travel Tumbler',
    category: 'c-retail',
    price: 120000,
    image: '/menu/retail/travel_tumbler.svg',
    mode: 'direct',
    stock: 6,
    minStock: 5,
  },
];

const SEED_USERS = [
  {
    key: 'u-1',
    name: 'Budi Santoso',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    isActive: true,
  },
  {
    key: 'u-2',
    name: 'Siti Rahayu',
    username: 'kasir',
    password: 'kasir123',
    role: 'kasir',
    isActive: true,
  },
  {
    key: 'u-3',
    name: 'Andi Wijaya',
    username: 'kasir2',
    password: 'kasir123',
    role: 'kasir',
    isActive: false,
  },
] as const;

const HISTORY_CASHIERS = ['u-2', 'u-3'] as const;
const PAYMENT_MIX = [
  'qris',
  'qris',
  'cash',
  'cash',
  'cash',
  'debit',
  'credit',
] as const;

const HISTORY_CUSTOMERS = [
  {
    name: 'Dewi Lestari',
    phone: '628123450101',
    email: 'dewi.lestari@example.com',
  },
  { name: 'Bagus Pratama', phone: '628133450202', email: null },
  {
    name: 'Rina Kusuma',
    phone: '628523450303',
    email: 'rina.kusuma@example.com',
  },
  { name: 'Hendra Wijaya', phone: '628113450404', email: null },
  { name: 'Maya Anggraini', phone: '628773450505', email: null },
] as const;

/** Identical to the mock's PRNG, so the generated history matches exactly. */
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

type SeedOrder = {
  receiptNo: string;
  lines: {
    productId: Types.ObjectId;
    name: string;
    price: number;
    qty: number;
    stockMode: 'recipe' | 'direct';
  }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'qris' | 'debit' | 'credit';
  paidAmount: number;
  changeAmount: number;
  cashierId: Types.ObjectId;
  cashierName: string;
  customer: { name: string; phone: string; email: string | null } | null;
  createdAt: Date;
};

/**
 * Thirty days of trading so the reports screen has a previous period to compare
 * against — with only a week, every card would read "no comparable period".
 */
function buildHistory(
  products: {
    id: Types.ObjectId;
    name: string;
    price: number;
    stockMode: 'recipe' | 'direct';
  }[],
  cashierIds: Map<string, Types.ObjectId>,
  cashierNames: Map<string, string>,
  taxRate: number,
  timeZone: string,
): SeedOrder[] {
  const rand = mulberry32(20261017);
  const orders: SeedOrder[] = [];
  const now = Date.now();
  const HISTORY_DAYS = 30;
  let receiptCounter = 1000;

  for (let dayOffset = HISTORY_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const dayStart = new Date(
      startOfDayUtc(isoDay(new Date(now - dayOffset * 86_400_000)), timeZone),
    );

    const weekday = dayStart.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const orderCount = Math.round(
      (isWeekend ? 34 : 24) * (0.7 + rand() * 0.4) * (1 - dayOffset * 0.02),
    );

    for (let i = 0; i < orderCount; i += 1) {
      const lineCount = 1 + Math.floor(rand() * 3);
      const lines: SeedOrder['lines'] = [];

      for (let l = 0; l < lineCount; l += 1) {
        const product = products[Math.floor(rand() * products.length)];
        if (!product) continue;
        if (lines.some((line) => String(line.productId) === String(product.id)))
          continue;
        lines.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: 1 + Math.floor(rand() * 2),
          stockMode: product.stockMode,
        });
      }

      if (lines.length === 0) continue;

      const subtotal = lines.reduce(
        (sum, line) => sum + line.price * line.qty,
        0,
      );
      const taxAmount = Math.round(subtotal * taxRate);
      const total = subtotal + taxAmount;

      const cashierKey =
        HISTORY_CASHIERS[Math.floor(rand() * HISTORY_CASHIERS.length)]!;
      const method = PAYMENT_MIX[Math.floor(rand() * PAYMENT_MIX.length)]!;
      const cashierId = cashierIds.get(cashierKey);
      const cashierName = cashierNames.get(cashierKey);
      if (!cashierId || !cashierName) continue;

      // Shop hours in the store's zone: 08:00 to 20:59.
      const createdAt = new Date(
        dayStart.getTime() +
          (8 + Math.floor(rand() * 13)) * 3_600_000 +
          Math.floor(rand() * 60) * 60_000,
      );
      if (createdAt.getTime() > now) continue;

      receiptCounter += 1;

      const paidAmount =
        method === 'cash' ? Math.ceil(total / 5000) * 5000 : total;
      const customer =
        rand() < 0.34
          ? {
              ...HISTORY_CUSTOMERS[
                Math.floor(rand() * HISTORY_CUSTOMERS.length)
              ]!,
            }
          : null;

      orders.push({
        receiptNo: `MOKA-${receiptCounter}`,
        lines,
        subtotal,
        taxRate,
        taxAmount,
        total,
        paymentMethod: method,
        paidAmount,
        changeAmount: paidAmount - total,
        cashierId,
        cashierName,
        customer,
        createdAt,
      });
    }
  }

  return orders;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type SeedSummary = {
  categories: number;
  ingredients: number;
  products: number;
  users: number;
  orders: number;
  firstReceiptNo: string;
  lastReceiptNo: string;
  nextReceiptNo: number;
};

export async function runSeed(): Promise<SeedSummary> {
  const config = env();

  /**
   * Every collection is wiped below. That is the point of a demo seed, but it
   * must never be one mistyped environment away from a live shop's ledger.
   */
  if (
    config.NODE_ENV === 'production' &&
    process.env.SEED_ALLOW_PRODUCTION !== 'true'
  ) {
    throw new Error(
      'Refusing to seed a production database: runSeed deletes every collection. Set SEED_ALLOW_PRODUCTION=true only when that is intended.',
    );
  }

  await connectDatabase(config.MONGODB_URI);

  // Wipe in an order that does not matter — there are no foreign-key
  // constraints in MongoDB — but indexes must be rebuilt afterwards.
  await Promise.all(ALL_MODELS.map((model) => model.deleteMany({})));
  await Promise.all(ALL_MODELS.map((model) => model.syncIndexes()));

  const categoryIds = new Map<string, Types.ObjectId>();
  for (const category of SEED_CATEGORIES) {
    const created = await CategoryModel.create({
      name: category.name,
      sortOrder: category.sortOrder,
    });
    categoryIds.set(category.key, created._id as Types.ObjectId);
  }

  const ingredientIds = new Map<string, Types.ObjectId>();
  for (const ingredient of SEED_INGREDIENTS) {
    const created = await IngredientModel.create({
      name: ingredient.name,
      unit: ingredient.unit,
      stock: ingredient.stock,
      minStock: ingredient.minStock,
      costPerUnit: ingredient.costPerUnit,
    });
    ingredientIds.set(ingredient.key, created._id as Types.ObjectId);
  }

  const productIds: {
    id: Types.ObjectId;
    name: string;
    price: number;
    stockMode: 'recipe' | 'direct';
  }[] = [];
  for (const product of SEED_PRODUCTS) {
    const created = await ProductModel.create({
      name: product.name,
      categoryId: categoryIds.get(product.category),
      price: PLACEHOLDER_PRICES ? product.price : 0,
      image: product.image,
      stockMode: product.mode,
      stock: product.mode === 'direct' ? product.stock : undefined,
      minStock: product.mode === 'direct' ? product.minStock : undefined,
      recipe:
        product.mode === 'recipe'
          ? (product.recipe ?? []).map((item) => ({
              ingredientId: ingredientIds.get(item.key),
              qty: item.qty,
            }))
          : [],
      isActive: true,
    });
    productIds.push({
      id: created._id as Types.ObjectId,
      name: created.name,
      price: created.price,
      stockMode: created.stockMode as 'recipe' | 'direct',
    });
  }

  const cashierIds = new Map<string, Types.ObjectId>();
  const cashierNames = new Map<string, string>();
  for (const user of SEED_USERS) {
    const created = await UserModel.create({
      name: user.name,
      username: user.username,
      passwordHash: await hashPassword(user.password),
      role: user.role,
      isActive: user.isActive,
    });
    cashierIds.set(user.key, created._id as Types.ObjectId);
    cashierNames.set(user.key, created.name);
  }

  const orders = buildHistory(
    productIds,
    cashierIds,
    cashierNames,
    0.1,
    config.STORE_TIMEZONE,
  );
  await OrderModel.insertMany(orders);

  // The mock leaves history at MOKA-1001.. and resumes the counter well above
  // it, so seeded history cannot collide with a fresh sale.
  const nextReceiptNo = 2000 + orders.length + 1;
  await CounterModel.create({ _id: 'receipt', seq: nextReceiptNo });

  await StockMovementModel.deleteMany({});
  await ShiftModel.deleteMany({});

  return {
    categories: SEED_CATEGORIES.length,
    ingredients: SEED_INGREDIENTS.length,
    products: SEED_PRODUCTS.length,
    users: SEED_USERS.length,
    orders: orders.length,
    firstReceiptNo: orders[0]?.receiptNo ?? '',
    lastReceiptNo: orders.at(-1)?.receiptNo ?? '',
    nextReceiptNo,
  };
}

/**
 * Only when run as a script. Importing this module — as the seed test does —
 * must not wipe the database it merely touched.
 */
async function main(): Promise<void> {
  const summary = await runSeed();

  console.log(
    [
      `[seed] ${summary.categories} categories`,
      `[seed] ${summary.ingredients} ingredients`,
      `[seed] ${summary.products} products`,
      `[seed] ${summary.users} users`,
      `[seed] ${summary.orders} orders, ${summary.firstReceiptNo}..${summary.lastReceiptNo}`,
      `[seed] next receipt MOKA-${summary.nextReceiptNo}`,
      '',
      '  admin / admin123   (admin)',
      '  kasir / kasir123   (kasir)',
      '  kasir2 / kasir123  (deactivated — for refusal testing)',
    ].join('\n'),
  );

  await disconnectDatabase();
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch(async (error: unknown) => {
    console.error('[seed] failed', error);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
}
