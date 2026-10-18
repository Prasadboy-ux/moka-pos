import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { normalisePhone, calculateTax } from '../src/lib/money.js';
import { CategoryModel } from '../src/models/category.model.js';
import { CounterModel } from '../src/models/counter.model.js';
import { IngredientModel } from '../src/models/ingredient.model.js';
import { OrderModel } from '../src/models/order.model.js';
import { ProductModel } from '../src/models/product.model.js';
import { StockMovementModel } from '../src/models/stock-movement.model.js';
import {
  agentFor,
  createUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
  TEST_PASSWORD,
} from './helpers/mongo.js';

/**
 * The sale is the one endpoint that must not be able to half-happen. Almost
 * every assertion here is about what does *not* exist after a refusal.
 */

const app: Express = createApp();

let admin: Awaited<ReturnType<typeof agentFor>>;
let kasir: Awaited<ReturnType<typeof agentFor>>;

let beansId = '';
let milkId = '';
let waterId = '';

/** Price 28,000 so 10% VAT is exactly 2,800 and the arithmetic stays readable. */
const LATTE = 28000;

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
    passwordHash: await hashPassword(TEST_PASSWORD),
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
  beansId = String(beans._id);
  milkId = String(milk._id);

  const latte = await ProductModel.create({
    name: 'Classic Iced Caffe Latte',
    categoryId: coffee._id,
    price: LATTE,
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
  waterId = String(water._id);
  void latte;

  await CounterModel.create({ _id: 'receipt', seq: 2000 });
});

describe('tax arithmetic', () => {
  it('rounds to whole rupiah', () => {
    expect(calculateTax(28000, 0.1)).toBe(2800);
    // 37,500 at 10% is 3,750 exactly.
    expect(calculateTax(37500, 0.1)).toBe(3750);
  });
});

describe('POST /api/orders', () => {
  let latteId = '';

  beforeEach(async () => {
    const latte = await ProductModel.findOne({
      name: 'Classic Iced Caffe Latte',
    });
    latteId = String(latte!._id);
  });

  it('completes a sale and returns the receipt with its movements', async () => {
    const response = await kasir.agent
      .post('/api/orders')
      .send({
        lines: [{ productId: latteId, qty: 2 }],
        paymentMethod: 'cash',
        paidAmount: 61600,
      })
      .expect(201);

    const { order, movements } = response.body;

    expect(order.receiptNo).toBe('MOKA-2001');
    expect(order.subtotal).toBe(56000);
    expect(order.taxRate).toBe(0.1);
    expect(order.taxAmount).toBe(5600);
    expect(order.total).toBe(61600);
    expect(order.changeAmount).toBe(0);

    // One cart line, two recipe items, so two ledger rows — one per ingredient the
    // drink consumed. Quantity multiplies the amounts; it does not multiply rows.
    expect(movements).toHaveLength(2);
    expect(movements.every((m: { type: string }) => m.type === 'sale')).toBe(
      true,
    );
    expect(movements[0].note).toBe('Sold on MOKA-2001');
  });

  it('consumes ingredients in proportion to quantity', async () => {
    await kasir.agent
      .post('/api/orders')
      .send({
        lines: [{ productId: latteId, qty: 2 }],
        paymentMethod: 'qris',
        paidAmount: 61600,
      })
      .expect(201);

    const milk = await IngredientModel.findById(milkId);
    const beans = await IngredientModel.findById(beansId);

    expect(milk?.stock).toBe(1000 - 180 * 2);
    expect(beans?.stock).toBe(5000 - 18 * 2);
  });

  it('consumes a direct product and records pcs movements', async () => {
    const response = await kasir.agent
      .post('/api/orders')
      .send({
        lines: [{ productId: waterId, qty: 3 }],
        paymentMethod: 'qris',
        paidAmount: 16500,
      })
      .expect(201);

    expect(response.body.movements).toHaveLength(1);
    expect(response.body.movements[0].qty).toBe(-3);
    expect(response.body.movements[0].unit).toBe('pcs');

    const water = await ProductModel.findById(waterId);
    expect(water?.stock).toBe(7);
  });

  describe('totals are never taken from the client', () => {
    it('ignores subtotal, tax, total and change sent in the body', async () => {
      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 2 }],
          paymentMethod: 'qris',
          paidAmount: 11000,
          subtotal: 1,
          taxAmount: 0,
          total: 1,
          changeAmount: 999999,
        })
        .expect(201);

      expect(response.body.order.subtotal).toBe(10000);
      expect(response.body.order.taxAmount).toBe(1000);
      expect(response.body.order.total).toBe(11000);
      expect(response.body.order.changeAmount).toBe(0);
    });

    it('uses the stored price, not one the client claims', async () => {
      await ProductModel.updateOne({ _id: waterId }, { $set: { price: 6000 } });

      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 1, price: 1 }],
          paymentMethod: 'qris',
          paidAmount: 6600,
        })
        .expect(201);

      expect(response.body.order.subtotal).toBe(6000);
      expect(response.body.order.lines[0].price).toBe(6000);
    });
  });

  describe('cashier is taken from the session', () => {
    it('ignores a cashier named in the body', async () => {
      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'qris',
          paidAmount: 5500,
          cashier: { id: admin.user.id, name: 'Budi Santoso' },
        })
        .expect(201);

      expect(response.body.order.cashierName).toBe('Siti Rahayu');
      expect(response.body.order.cashierId).toBe(kasir.user.id);
    });
  });

  describe('stock coverage', () => {
    it('refuses a recipe product whose ingredient is short, naming it', async () => {
      // 1000 ml on hand; six lattes need 1080.
      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: latteId, qty: 6 }],
          paymentMethod: 'cash',
          paidAmount: 200000,
        })
        .expect(409);

      expect(response.body.error).toBe('insufficient-stock');
      expect(response.body.message).toMatch(/Fresh Milk/);
    });

    it('refuses a direct product that is out of stock', async () => {
      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 11 }],
          paymentMethod: 'cash',
          paidAmount: 100000,
        })
        .expect(409);

      expect(response.body.error).toBe('insufficient-stock');
      expect(response.body.message).toMatch(/Mineral Water/);
    });

    /**
     * The whole point of the transaction. A refusal must leave no receipt, no
     * stock moved, and no ledger rows.
     */
    it('leaves nothing behind when the sale is refused', async () => {
      await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: latteId, qty: 6 }],
          paymentMethod: 'cash',
          paidAmount: 200000,
        })
        .expect(409);

      expect(await OrderModel.countDocuments()).toBe(0);
      expect(await StockMovementModel.countDocuments()).toBe(0);
      expect((await IngredientModel.findById(milkId))?.stock).toBe(1000);
      expect((await IngredientModel.findById(beansId))?.stock).toBe(5000);
    });

    it('does not consume the receipt counter when the sale is refused', async () => {
      await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: latteId, qty: 6 }],
          paymentMethod: 'cash',
          paidAmount: 200000,
        })
        .expect(409);

      const counter = await CounterModel.findById('receipt');
      expect(counter?.seq).toBe(2000);

      // The next real sale must therefore be 2001, with no gap.
      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'qris',
          paidAmount: 5500,
        })
        .expect(201);

      expect(response.body.order.receiptNo).toBe('MOKA-2001');
    });

    it('refuses an unknown product before creating anything', async () => {
      await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: '64b7f9c2e1a2b3c4d5e6f7a8', qty: 1 }],
          paymentMethod: 'cash',
          paidAmount: 1000,
        })
        .expect(404);

      expect(await OrderModel.countDocuments()).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('returns the original receipt for a repeated key', async () => {
      const body = {
        lines: [{ productId: waterId, qty: 1 }],
        paymentMethod: 'qris',
        paidAmount: 5500,
      };

      const first = await kasir.agent
        .post('/api/orders')
        .set('Idempotency-Key', 'till-1-attempt-1')
        .send(body)
        .expect(201);

      const second = await kasir.agent
        .post('/api/orders')
        .set('Idempotency-Key', 'till-1-attempt-1')
        .send(body)
        .expect(200);

      expect(second.headers['idempotent-replay']).toBe('true');
      expect(second.body.order.id).toBe(first.body.order.id);
      expect(second.body.order.receiptNo).toBe(first.body.order.receiptNo);

      // The critical assertion: one sale, one charge.
      expect(await OrderModel.countDocuments()).toBe(1);
      expect((await ProductModel.findById(waterId))?.stock).toBe(9);
    });

    it('treats a blank Idempotency-Key as absent', async () => {
      const body = {
        lines: [{ productId: waterId, qty: 1 }],
        paymentMethod: 'qris',
        paidAmount: 5500,
      };

      await kasir.agent
        .post('/api/orders')
        .set('Idempotency-Key', '')
        .send(body)
        .expect(201);
      // A blank key must not make this a replay of the sale above.
      await kasir.agent
        .post('/api/orders')
        .set('Idempotency-Key', '')
        .send(body)
        .expect(201);

      expect(await OrderModel.countDocuments()).toBe(2);
    });

    it('does not consume the same stock twice under one key', async () => {
      const body = {
        lines: [{ productId: waterId, qty: 1 }],
        paymentMethod: 'qris',
        paidAmount: 5500,
      };

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await kasir.agent
          .post('/api/orders')
          .set('Idempotency-Key', 'retry-me')
          .send(body)
          .expect((code: number) => code === 200 || code === 201);
      }

      expect((await ProductModel.findById(waterId))?.stock).toBe(9);
    });
  });

  describe('customer normalisation', () => {
    it('normalises an Indonesian number to digits a wa.me link can use', async () => {
      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'qris',
          paidAmount: 5500,
          customer: {
            name: '  Dewi Lestari ',
            phone: '+62 812-3456-7890',
            email: ' dewi@example.com ',
          },
        })
        .expect(201);

      expect(response.body.order.customer).toEqual({
        name: 'Dewi Lestari',
        phone: '6281234567890',
        email: 'dewi@example.com',
      });
    });

    it('drops a customer with no usable number rather than storing an unsendable one', async () => {
      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'qris',
          paidAmount: 5500,
          customer: { name: 'Walk-in', phone: '', email: 'walkin@example.com' },
        })
        .expect(201);

      expect(response.body.order.customer).toBeNull();
    });

    it('keeps a number even when the name was left blank', async () => {
      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'qris',
          paidAmount: 5500,
          customer: { name: '', phone: '081234567890', email: '' },
        })
        .expect(201);

      expect(response.body.order.customer).toEqual({
        name: 'Customer',
        phone: '6281234567890',
        email: null,
      });
    });
  });

  it('refuses an empty cart', async () => {
    await kasir.agent
      .post('/api/orders')
      .send({ lines: [], paymentMethod: 'cash', paidAmount: 0 })
      .expect(422);
  });

  it('requires a session', async () => {
    await request(app)
      .post('/api/orders')
      .send({
        lines: [{ productId: waterId, qty: 1 }],
        paymentMethod: 'cash',
        paidAmount: 5500,
      })
      .expect(401);
  });
});

describe('normalisePhone', () => {
  it('accepts the Indonesian spellings of one number', () => {
    for (const raw of [
      '+62 812-3456-7890',
      '0812 3456 7890',
      '81234567890',
      '62 812 3456 7890',
    ]) {
      expect(normalisePhone(raw), raw).toBe('6281234567890');
    }
  });

  it('returns null when there is nothing to link to', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('   ')).toBeNull();
    expect(normalisePhone('123')).toBeNull();
    expect(normalisePhone('not a number')).toBeNull();
  });
});

describe('GET /api/orders', () => {
  it('filters inclusively by day, in the store timezone', async () => {
    // 20:30 WIB on the 17th is 13:30 UTC on the 17th.
    await OrderModel.create({
      receiptNo: 'MOKA-9001',
      lines: [
        {
          productId: waterId,
          name: 'Mineral Water',
          price: 5000,
          qty: 1,
          stockMode: 'direct',
        },
      ],
      subtotal: 5000,
      taxRate: 0.1,
      taxAmount: 500,
      total: 5500,
      paymentMethod: 'qris',
      paidAmount: 5500,
      changeAmount: 0,
      cashierId: kasir.user.id,
      cashierName: 'Siti Rahayu',
      createdAt: new Date('2026-10-17T13:30:00Z'),
    });

    const response = await kasir.agent
      .get('/api/orders?from=2026-10-17&to=2026-10-17')
      .expect(200);

    // The regression this guards: a bare `to` at midnight UTC would drop this.
    expect(response.body).toHaveLength(1);
  });

  it('excludes the next day', async () => {
    await OrderModel.create({
      receiptNo: 'MOKA-9002',
      lines: [
        {
          productId: waterId,
          name: 'Mineral Water',
          price: 5000,
          qty: 1,
          stockMode: 'direct',
        },
      ],
      subtotal: 5000,
      taxRate: 0.1,
      taxAmount: 500,
      total: 5500,
      paymentMethod: 'qris',
      paidAmount: 5500,
      changeAmount: 0,
      cashierId: kasir.user.id,
      cashierName: 'Siti Rahayu',
      createdAt: new Date('2026-10-18T02:00:00Z'),
    });

    const response = await kasir.agent
      .get('/api/orders?from=2026-10-17&to=2026-10-17')
      .expect(200);

    expect(response.body).toHaveLength(0);
  });

  it('returns newest first', async () => {
    for (const [receiptNo, createdAt] of [
      ['MOKA-9001', '2026-10-15T03:00:00Z'],
      ['MOKA-9003', '2026-10-17T03:00:00Z'],
      ['MOKA-9002', '2026-10-16T03:00:00Z'],
    ] as const) {
      await OrderModel.create({
        receiptNo,
        lines: [
          {
            productId: waterId,
            name: 'Mineral Water',
            price: 5000,
            qty: 1,
            stockMode: 'direct',
          },
        ],
        subtotal: 5000,
        taxRate: 0.1,
        taxAmount: 500,
        total: 5500,
        paymentMethod: 'qris',
        paidAmount: 5500,
        changeAmount: 0,
        cashierId: kasir.user.id,
        cashierName: 'Siti Rahayu',
        createdAt: new Date(createdAt),
      });
    }

    const response = await kasir.agent.get('/api/orders').expect(200);

    expect(
      response.body.map((o: { receiptNo: string }) => o.receiptNo),
    ).toEqual(['MOKA-9003', 'MOKA-9002', 'MOKA-9001']);
  });

  it('rejects an impossible date', async () => {
    await kasir.agent.get('/api/orders?from=2026-02-31').expect(422);
  });
});

describe('GET /api/orders/recent', () => {
  it('defaults to eight and honours a limit', async () => {
    for (let n = 0; n < 12; n += 1) {
      await OrderModel.create({
        receiptNo: `MOKA-${8000 + n}`,
        lines: [
          {
            productId: waterId,
            name: 'Mineral Water',
            price: 5000,
            qty: 1,
            stockMode: 'direct',
          },
        ],
        subtotal: 5000,
        taxRate: 0.1,
        taxAmount: 500,
        total: 5500,
        paymentMethod: 'qris',
        paidAmount: 5500,
        changeAmount: 0,
        cashierId: kasir.user.id,
        cashierName: 'Siti Rahayu',
        createdAt: new Date(2026, 9, 1 + n),
      });
    }

    expect(
      (await kasir.agent.get('/api/orders/recent').expect(200)).body,
    ).toHaveLength(8);
    expect(
      (await kasir.agent.get('/api/orders/recent?limit=3').expect(200)).body,
    ).toHaveLength(3);
  });

  it('is not shadowed by GET /orders/:id', async () => {
    const response = await kasir.agent.get('/api/orders/recent').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe('receipt history survives a deleted product', () => {
  it('still prints what was charged', async () => {
    const created = await kasir.agent
      .post('/api/orders')
      .send({
        lines: [{ productId: waterId, qty: 1 }],
        paymentMethod: 'qris',
        paidAmount: 5500,
      })
      .expect(201);

    await ProductModel.deleteOne({ _id: waterId });

    const receipt = await kasir.agent
      .get(`/api/orders/${created.body.order.id}`)
      .expect(200);

    expect(receipt.body.lines[0].name).toBe('Mineral Water');
    expect(receipt.body.lines[0].price).toBe(5000);
    expect(receipt.body.total).toBe(5500);
  });
});
