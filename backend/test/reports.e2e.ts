import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { CategoryModel } from '../src/models/category.model.js';
import { IngredientModel } from '../src/models/ingredient.model.js';
import { OrderModel } from '../src/models/order.model.js';
import { ProductModel } from '../src/models/product.model.js';
import {
  agentFor,
  createUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/mongo.js';

/**
 * The report is the number the owner compares banks, suppliers and their own
 * memory against, so every test here writes orders it can total by hand and
 * asserts the API lands on the same figure — regardless of legacy shape this
 * report is the authority, and whatever the frontend used to compute belongs
 * to history.
 */

const app: Express = createApp();

let admin: Awaited<ReturnType<typeof agentFor>>;
let kasir: Awaited<ReturnType<typeof agentFor>>;

let latteId = '';
let waterId = '';
let coffeeCategoryId = '';
let retailCategoryId = '';

// 20:30 WIB is 13:30 UTC, so every fixture timestamp sits inside a WIB day with
// room on both sides of the boundary a store's midnight actually falls on.
const ON_SIXTEENTH = '2026-10-16T13:30:00Z';

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();

  await createUser({
    name: 'Budi Santoso',
    username: 'admin',
    passwordHash: await hashPassword('admin123'),
    role: 'admin',
  });
  await createUser({
    name: 'Siti Rahayu',
    username: 'kasir',
    passwordHash: await hashPassword('kasir123'),
    role: 'kasir',
  });
  admin = await agentFor(app, 'admin');
  kasir = await agentFor(app, 'kasir');

  const coffee = await CategoryModel.create({ name: 'Coffee', sortOrder: 1 });
  const retail = await CategoryModel.create({ name: 'Retail', sortOrder: 2 });

  const beans = await IngredientModel.create({
    name: 'House Blend Beans',
    unit: 'gram',
    stock: 5000,
    minStock: 1000,
    costPerUnit: 380,
  });
  const milk = await IngredientModel.create({
    name: 'Fresh Milk',
    unit: 'ml',
    stock: 1000,
    minStock: 2000,
    costPerUnit: 16,
  });

  const latte = await ProductModel.create({
    name: 'Classic Iced Caffe Latte',
    categoryId: coffee._id,
    price: 28000,
    image: '/menu/coffee/classic_iced_latte.svg',
    stockMode: 'recipe',
    recipe: [
      { ingredientId: beans._id, qty: 18 },
      { ingredientId: milk._id, qty: 180 },
    ],
    isActive: true,
  });
  const water = await ProductModel.create({
    name: 'Mineral Water',
    categoryId: retail._id,
    price: 5000,
    image: '/menu/retail/mineral_water.svg',
    stockMode: 'direct',
    stock: 10,
    minStock: 5,
    recipe: [],
    isActive: true,
  });
  latteId = String(latte._id);
  waterId = String(water._id);
  coffeeCategoryId = String(coffee._id);
  retailCategoryId = String(retail._id);
});

type FixtureLine = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  stockMode: 'recipe' | 'direct';
};

async function paidOrder(options: {
  lines: FixtureLine[];
  total: number;
  paymentMethod: 'cash' | 'qris' | 'debit' | 'credit';
  createdAt: string;
  status?: 'paid' | 'voided';
  customer?: { name: string; phone: string };
}): Promise<void> {
  await OrderModel.create({
    receiptNo: `MOKA-${Math.floor(Math.random() * 1_000_000)}`,
    lines: options.lines,
    subtotal: Math.round(options.total / 1.1),
    taxRate: 0.1,
    taxAmount: options.total - Math.round(options.total / 1.1),
    total: options.total,
    paymentMethod: options.paymentMethod,
    paidAmount: options.total,
    changeAmount: 0,
    cashierId: kasir.user.id,
    cashierName: 'Siti Rahayu',
    status: options.status ?? 'paid',
    customer: options.customer ?? null,
    createdAt: new Date(options.createdAt),
  });
}

/**
 * The disbursement fixture: one latte at 61,600 (two lines, one order), one
 * water paid in cash at 11,000, and one water on a card at 5,500 — three paid
 * receipts totalling 78,100 across five sold items, plus a voided receipt that
 * must be invisible in every figure.
 */
beforeEach(async () => {
  await paidOrder({
    lines: [
      {
        productId: latteId,
        name: 'Classic Iced Caffe Latte',
        price: 28000,
        qty: 2,
        stockMode: 'recipe',
      },
    ],
    total: 61600,
    paymentMethod: 'qris',
    createdAt: ON_SIXTEENTH,
  });
  await paidOrder({
    lines: [
      {
        productId: waterId,
        name: 'Mineral Water',
        price: 5000,
        qty: 2,
        stockMode: 'direct',
      },
    ],
    total: 11000,
    paymentMethod: 'cash',
    createdAt: ON_SIXTEENTH,
  });
  await paidOrder({
    lines: [
      {
        productId: waterId,
        name: 'Mineral Water',
        price: 5000,
        qty: 1,
        stockMode: 'direct',
      },
    ],
    total: 5500,
    paymentMethod: 'debit',
    createdAt: ON_SIXTEENTH,
    customer: { name: 'Andi Wijaya', phone: '+62 812 7000 123' },
  });
  await paidOrder({
    lines: [
      {
        productId: waterId,
        name: 'Mineral Water',
        price: 5000,
        qty: 5,
        stockMode: 'direct',
      },
    ],
    total: 27500,
    paymentMethod: 'cash',
    createdAt: ON_SIXTEENTH,
    status: 'voided',
  });
});

describe('GET /api/reports/sales', () => {
  it('totals the range from paid receipts only', async () => {
    const response = await admin.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16')
      .expect(200);

    // 61,600 + 11,000 + 5,500, with the voided 27,500 nowhere in it.
    expect(response.body.kpi).toEqual({
      revenue: 78100,
      transactions: 3,
      averageOrderValue: 26033, // round(78100 / 3)
      itemsSold: 5,
      withCustomer: 1, // only Andi's receipt carries a phone
    });
  });

  it('narrows the tiles the way the ledger narrows them', async () => {
    const byMethod = await admin.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16&method=cash')
      .expect(200);

    // The other cash receipt in the window was voided, so tiles stay phantom-free.
    expect(byMethod.body.kpi).toEqual({
      revenue: 11000,
      transactions: 1,
      averageOrderValue: 11000,
      itemsSold: 2,
      withCustomer: 0,
    });

    const byName = await admin.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16&q=Andi')
      .expect(200);

    expect(byName.body.kpi).toEqual({
      revenue: 5500,
      transactions: 1,
      averageOrderValue: 5500,
      itemsSold: 1,
      withCustomer: 1,
    });
  });

  it('splits payments in order of takings', async () => {
    const response = await admin.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16')
      .expect(200);

    expect(response.body.paymentBreakdown).toEqual([
      { method: 'qris', count: 1, total: 61600 },
      { method: 'cash', count: 1, total: 11000 },
      { method: 'debit', count: 1, total: 5500 },
    ]);
  });

  it('zero-fills the trend by day', async () => {
    const response = await admin.agent
      .get('/api/reports/sales?from=2026-10-14&to=2026-10-16')
      .expect(200);

    expect(response.body.trend.bucket).toBe('day');
    // Nothing from a voided receipt; nothing invented beyond the range.
    expect(
      response.body.trend.points.map(
        (p: { date: string; revenue: number; transactions: number }) => [
          p.date,
          p.revenue,
          p.transactions,
        ],
      ),
    ).toEqual([
      ['2026-10-14', 0, 0],
      ['2026-10-15', 0, 0],
      ['2026-10-16', 78100, 3],
    ]);
  });

  it('switches to months once the range outgrows days', async () => {
    const response = await admin.agent
      .get('/api/reports/sales?from=2026-09-01&to=2026-10-16')
      .expect(200);

    expect(response.body.trend.bucket).toBe('month');
    expect(
      response.body.trend.points.map(
        (p: { date: string; revenue: number }) => [p.date, p.revenue],
      ),
    ).toEqual([
      ['2026-09', 0],
      ['2026-10', 78100],
    ]);
  });

  it('allocates gross revenue across categories without losing rupiah', async () => {
    const response = await admin.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16')
      .expect(200);

    // Every receipt here has one line, so allocation is exact: 61,600 coffee
    // and 16,500 retail, and the two rows must sum to the KPI revenue.
    expect(response.body.byCategory).toEqual([
      {
        categoryId: coffeeCategoryId,
        categoryName: 'Coffee',
        revenue: 61600,
        itemsSold: 2,
      },
      {
        categoryId: retailCategoryId,
        categoryName: 'Retail',
        revenue: 16500,
        itemsSold: 3,
      },
    ]);
    expect(response.body.byCategory.reduce((sum: number, row: { revenue: number }) => sum + row.revenue, 0)).toBe(
      response.body.kpi.revenue,
    );
  });

  it('ranks the top sellers by gross revenue', async () => {
    const response = await admin.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16')
      .expect(200);

    expect(response.body.topProducts).toEqual([
      {
        productId: latteId,
        name: 'Classic Iced Caffe Latte',
        quantity: 2,
        revenue: 61600,
      },
      {
        productId: waterId,
        name: 'Mineral Water',
        quantity: 3,
        revenue: 16500,
      },
    ]);
  });

  it('attributes the day to its cashiers', async () => {
    const response = await admin.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16')
      .expect(200);

    expect(response.body.byCashier).toEqual([
      {
        cashierId: String(kasir.user.id),
        cashierName: 'Siti Rahayu',
        transactions: 3,
        revenue: 78100,
        averageOrderValue: 26033,
        itemsSold: 5,
      },
    ]);
  });

  it('keeps a deleted product revenue in an uncategorised row', async () => {
    await ProductModel.deleteOne({ _id: waterId });

    const response = await admin.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16')
      .expect(200);

    // The water receipts are still sales; deleting the shelf does not delete
    // the revenue, and routing it to nothing would break the sum above it.
    expect(response.body.byCategory).toHaveLength(2);
    const uncategorised = response.body.byCategory.find(
      (row: { categoryId: string }) => row.categoryId === '__uncategorised__',
    );
    expect(uncategorised).toEqual({
      categoryId: '__uncategorised__',
      categoryName: 'Uncategorised',
      revenue: 16500,
      itemsSold: 3,
    });
  });

  it('answers a kasir the same as it would an admin', async () => {
    const response = await kasir.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16')
      .expect(200);

    expect(response.body.kpi.revenue).toBe(78100);
  });

  it('requires a session', async () => {
    await request(app)
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-16')
      .expect(401);
  });

  it('insists on both ends of the range', async () => {
    await admin.agent.get('/api/reports/sales').expect(422);
    await admin.agent.get('/api/reports/sales?from=2026-10-16').expect(422);
    await admin.agent.get('/api/reports/sales?to=2026-10-16').expect(422);
  });

  it('refuses an inverted range', async () => {
    const response = await admin.agent
      .get('/api/reports/sales?from=2026-10-16&to=2026-10-14')
      .expect(422);

    expect(response.body.fields?.to).toBe(
      'Set the end date on or after the start date.',
    );
  });
});
