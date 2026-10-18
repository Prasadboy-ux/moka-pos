import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed, type SeedSummary } from '../src/seed.js';
import { verifyPassword } from '../src/lib/password.js';
import {
  CategoryModel,
  IngredientModel,
  OrderModel,
  ProductModel,
  StockMovementModel,
  findByUsername,
  UserModel,
} from '../src/models/index.js';
import { startTestDatabase, stopTestDatabase } from './helpers/mongo.js';

/**
 * The seed exists to make the swap invisible: the 154-check smoke suite has to
 * pass against this data without a single screen being edited. So these
 * assertions are about *parity with the frontend mock*, not about what a cafe
 * would find sensible.
 */

let summary: SeedSummary;

beforeAll(async () => {
  await startTestDatabase();
  summary = await runSeed();
}, 180_000);

afterAll(async () => {
  await stopTestDatabase();
});

describe('catalogue parity', () => {
  it('seeds the same shape the mock does', () => {
    expect(summary.categories).toBe(4);
    expect(summary.ingredients).toBe(10);
    expect(summary.products).toBe(20);
    expect(summary.users).toBe(3);
  });

  it('orders categories by sortOrder, as the POS grid expects', async () => {
    const categories = await CategoryModel.find().sort({ sortOrder: 1 });
    expect(categories.map((c) => c.name)).toEqual([
      'Coffee',
      'Non Coffee',
      'Snack',
      'Retail',
    ]);
  });

  it('keeps the eight recipe drinks and twelve counted goods', async () => {
    const recipe = await ProductModel.countDocuments({ stockMode: 'recipe' });
    const direct = await ProductModel.countDocuments({ stockMode: 'direct' });

    expect(recipe).toBe(8);
    expect(direct).toBe(12);
  });

  it('gives recipe products no stock of their own', async () => {
    const withStock = await ProductModel.countDocuments({
      stockMode: 'recipe',
      stock: { $exists: true },
    });

    expect(withStock).toBe(0);
  });

  it('stores ingredient cost per single unit, not per bag', async () => {
    const beans = await IngredientModel.findOne({ name: 'House Blend Beans' });

    // A 250 g bag at Rp 95,000 is 380 per gram. Storing 95000 here would make
    // every recipe cost read as a rounding error.
    expect(beans?.costPerUnit).toBe(380);
  });
});

describe('accounts', () => {
  it('hashes the demo passwords rather than storing them', async () => {
    const admin = await findByUsername('admin').select('+passwordHash');

    expect(admin?.passwordHash).not.toBe('admin123');
    expect(admin?.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('admin123', admin!.passwordHash)).toBe(true);
    expect(await verifyPassword('wrong', admin!.passwordHash)).toBe(false);
  });

  it('never returns a password field on the API shape', async () => {
    const admin = await findByUsername('admin');
    const json = admin!.toJSON() as Record<string, unknown>;

    expect(json).not.toHaveProperty('password');
    expect(json).not.toHaveProperty('passwordHash');
    expect(json).toMatchObject({
      username: 'admin',
      role: 'admin',
      isActive: true,
    });
  });

  it('keeps kasir2 deactivated, so refusal paths have a fixture', async () => {
    expect((await findByUsername('kasir2'))?.isActive).toBe(false);
  });
});

describe('history', () => {
  it('generates thirty days of sales starting above MOKA-1000', async () => {
    expect(summary.orders).toBeGreaterThan(400);
    expect(summary.firstReceiptNo).toBe('MOKA-1001');
  });

  it('is deterministic — the same PRNG seed, the same count', async () => {
    const again = await runSeed();
    expect(again.orders).toBe(summary.orders);
  });

  it('resumes the receipt counter above the seeded history', async () => {
    // Otherwise a fresh sale would collide with a receipt already on disk.
    expect(summary.nextReceiptNo).toBeGreaterThan(summary.orders + 1000);
  });

  it('charges tax at 10% and balances every order', async () => {
    const orders = await OrderModel.find().limit(200);

    for (const order of orders) {
      expect(order.taxRate).toBe(0.1);
      expect(order.taxAmount).toBe(Math.round(order.subtotal * 0.1));
      expect(order.total).toBe(order.subtotal + order.taxAmount);
      expect(order.changeAmount).toBe(order.paidAmount - order.total);
    }
  });

  it('rounds cash payments up to the nearest 5,000', async () => {
    const cash = await OrderModel.find({ paymentMethod: 'cash' }).limit(50);

    for (const order of cash) {
      expect(order.paidAmount % 5000).toBe(0);
      expect(order.paidAmount).toBeGreaterThanOrEqual(order.total);
    }
  });

  it('denormalises the cashier name onto each order', async () => {
    const orders = await OrderModel.find().limit(50);

    for (const order of orders) {
      expect(order.cashierName).toBeTruthy();
      expect(await UserModel.exists({ _id: order.cashierId })).not.toBeNull();
    }
  });

  it('attaches a customer to about a third of orders, not all of them', async () => {
    const orders = await OrderModel.find();
    const withCustomer = orders.filter(
      (order) => order.customer !== null,
    ).length;

    expect(withCustomer).toBeGreaterThan(0);
    // The transactions screen needs both the attached and the null case.
    expect(withCustomer).toBeLessThan(orders.length);
  });

  it('lands no sale in the future', async () => {
    const orders = await OrderModel.find();
    const now = Date.now();

    expect(orders.some((order) => order.createdAt.getTime() > now)).toBe(false);
  });
});

describe('known deviation', () => {
  it('starts the ledger empty, matching the mock', async () => {
    // Documented in seed.ts. Thirty days of sales with an empty ledger is not
    // what a real shop looks like, but parity is what keeps the smoke suite
    // green. Back-filling movements is a deliberate follow-up.
    expect(await StockMovementModel.estimatedDocumentCount()).toBe(0);
  });
});
