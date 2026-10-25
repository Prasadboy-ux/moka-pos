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

  // A shift gates selling, so every sale test opens one the way the POS does.
  await kasir.agent.post('/api/shifts').send({ openingFloat: 0 }).expect(201);

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

  it('refuses a sale when the cashier has no open shift, and writes nothing', async () => {
    const current = await kasir.agent.get('/api/shifts/current').expect(200);
    await kasir.agent
      .post(`/api/shifts/${current.body.id}/close`)
      .send({ counted: 0 })
      .expect(200);

    const response = await kasir.agent
      .post('/api/orders')
      .send({
        lines: [{ productId: latteId, qty: 1 }],
        paymentMethod: 'cash',
        paidAmount: 30800,
      })
      .expect(409);

    expect(response.body.reason).toBe('no-open-shift');

    // The refusal must leave no trace: no receipt, no stock movement.
    expect(await OrderModel.countDocuments()).toBe(0);
    expect(await StockMovementModel.countDocuments()).toBe(0);

    const latte = await ProductModel.findOne({ name: 'Classic Iced Caffe Latte' });
    expect(latte).toBeTruthy();
  });

  it('stamps the open shift onto the receipt', async () => {
    const current = await kasir.agent.get('/api/shifts/current').expect(200);

    const response = await kasir.agent
      .post('/api/orders')
      .send({
        lines: [{ productId: latteId, qty: 1 }],
        paymentMethod: 'cash',
        paidAmount: 30800,
      })
      .expect(201);

    expect(response.body.order.shiftId).toBe(current.body.id);
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

  describe('menu and payment guards', () => {
    it('refuses a product hidden after the tab was opened', async () => {
      await ProductModel.updateOne(
        { _id: waterId },
        { $set: { isActive: false } },
      );

      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'qris',
          paidAmount: 5500,
        })
        .expect(422);

      expect(response.body.error).toBe('validation');
      expect(response.body.fields).toHaveProperty('lines');
      expect(await OrderModel.countDocuments()).toBe(0);
      expect(await StockMovementModel.countDocuments()).toBe(0);
      expect((await ProductModel.findById(waterId))?.stock).toBe(10);
    });

    it('refuses an underpayment and leaves the stock alone', async () => {
      const response = await kasir.agent
        .post('/api/orders')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'cash',
          paidAmount: 5499,
        })
        .expect(422);

      expect(response.body.fields).toHaveProperty('paidAmount');
      expect(await OrderModel.countDocuments()).toBe(0);
      expect(await StockMovementModel.countDocuments()).toBe(0);
      expect((await ProductModel.findById(waterId))?.stock).toBe(10);
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

    it('never hands another cashier\'s receipt back through a learned key', async () => {
      // The key is the retry token of whoever minted it. An admin who somehow
      // learns a cashier's key must not receive the cashier's receipt.
      const first = await kasir.agent
        .post('/api/orders')
        .set('Idempotency-Key', 'kasir-till-attempt-1')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'qris',
          paidAmount: 5500,
        })
        .expect(201);

      const owned = await kasir.agent
        .post('/api/orders')
        .set('Idempotency-Key', 'kasir-till-attempt-1')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'qris',
          paidAmount: 5500,
        })
        .expect(200);

      await admin.agent
        .post('/api/orders')
        .set('Idempotency-Key', 'kasir-till-attempt-1')
        .send({
          lines: [{ productId: waterId, qty: 1 }],
          paymentMethod: 'qris',
          paidAmount: 5500,
        })
        .expect(409)
        .expect('content-type', /json/)
        .expect((res) => {
          expect(res.body.error).toBe('conflict');
          expect(res.body.reason).toBe('idempotency-key-foreign');
        });

      // Exactly one sale exists and it belongs to the key's originator; the
      // foreign replay was refused as a candidate sale, not recorded.
      expect(await OrderModel.countDocuments()).toBe(1);
      expect(owned.body.order.id).toBe(first.body.order.id);
      expect((await ProductModel.findById(waterId))?.stock).toBe(9);
    });
  });

  /**
   * The atomic guard in consumeStock is the only thing standing between two
   * tills ringing the last unit of stock at the same moment. The sequential
   * tests above exercise the readable pre-check; these fire real concurrent
   * transactions so the `$inc` filtered on `stock >= qty` is what has to hold.
   *
   * Both refusal paths answer 409 insufficient-stock, so the assertions key on
   * that rather than on which message won.
   */
  describe('concurrent sales cannot oversell', () => {
    it('sells a direct product down to the last unit, refusing the rest', async () => {
      // 10 bottles on hand; five tills each ring three. Only three sales fit.
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          kasir.agent.post('/api/orders').send({
            lines: [{ productId: waterId, qty: 3 }],
            paymentMethod: 'cash',
            paidAmount: 16500,
          }),
        ),
      );

      const accepted = responses.filter((r) => r.status === 201);
      const refused = responses.filter((r) => r.status === 409);

      expect(accepted).toHaveLength(3);
      expect(refused).toHaveLength(2);
      for (const response of refused) {
        expect(response.body.error).toBe('insufficient-stock');
        expect(response.body.message).toMatch(/Mineral Water/);
      }

      // 10 - 3*3: one bottle remains, and only whole sales were counted.
      expect((await ProductModel.findById(waterId))?.stock).toBe(1);
      expect(await OrderModel.countDocuments()).toBe(3);
      expect(
        await StockMovementModel.countDocuments({
          type: 'sale',
          productId: (await ProductModel.findById(waterId))?._id,
        }),
      ).toBe(3);
    });

    it('refuses recipe sales that would drain a shared ingredient', async () => {
      // 1000 ml of milk; one latte needs 180. Five fit (900), six do not.
      const responses = await Promise.all(
        Array.from({ length: 7 }, () =>
          kasir.agent.post('/api/orders').send({
            lines: [{ productId: latteId, qty: 1 }],
            paymentMethod: 'cash',
            paidAmount: 30800,
          }),
        ),
      );

      const accepted = responses.filter((r) => r.status === 201);
      const refused = responses.filter((r) => r.status === 409);

      expect(accepted).toHaveLength(5);
      expect(refused).toHaveLength(2);
      for (const response of refused) {
        expect(response.body.error).toBe('insufficient-stock');
        expect(response.body.message).toMatch(/Fresh Milk/);
      }

      const milk = await IngredientModel.findById(milkId);
      expect(milk?.stock).toBe(1000 - 5 * 180);
      expect(
        await StockMovementModel.countDocuments({
          type: 'sale',
          ingredientId: milk?._id,
        }),
      ).toBe(5);

      // Receipt numbers are allocated inside the same transaction: no gaps, no
      // collisions, even when seven sales contend on the counter.
      const receipts = await OrderModel.find({}).select('receiptNo').lean();
      const numbers = receipts.map((order) =>
        Number(order.receiptNo.replace('MOKA-', '')),
      );
      numbers.sort((a, b) => a - b);
      expect(numbers).toEqual([2001, 2002, 2003, 2004, 2005]);
    });
  });

  describe('a shift closing around a sale', () => {
    /**
     * A close and a sale contend on the shift. Whichever commits second must see
     * the other: either the sale is refused for having no open shift, or it is
     * on the receipt and in `cashSales`. A close that silently missed it would
     * reconcile the drawer against takings it never counted.
     */
    it('never closes over a sale', async () => {
      let accepted = 0;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await kasir.agent.get('/api/shifts/current').expect(200);
        const shift =
          current.body ??
          (
            await kasir.agent
              .post('/api/shifts')
              .send({ openingFloat: 0 })
              .expect(201)
          ).body;

        const [sale, close] = await Promise.all([
          kasir.agent.post('/api/orders').send({
            lines: [{ productId: waterId, qty: 1 }],
            paymentMethod: 'cash',
            paidAmount: 5500,
          }),
          kasir.agent
            .post(`/api/shifts/${shift.id}/close`)
            .send({ counted: 0 }),
        ]);

        expect(close.status).toBe(200);

        if (sale.status === 201) {
          accepted += 1;
          expect(close.body.cashSales).toBe(5500);
          expect(close.body.expectedCash).toBe(5500);
        } else {
          expect(sale.status).toBe(409);
          expect(sale.body.reason).toBe('no-open-shift');
          expect(close.body.cashSales).toBe(0);
        }
      }

      expect(await OrderModel.countDocuments()).toBe(accepted);
      expect(await StockMovementModel.countDocuments()).toBe(accepted);
      expect((await ProductModel.findById(waterId))?.stock).toBe(10 - accepted);
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
    expect(response.body.data).toHaveLength(1);
    expect(response.body.total).toBe(1);
    // A page the caller did not ask for is still an explicit one.
    expect(response.body.limit).toBe(50);
    expect(response.body.offset).toBe(0);
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

    expect(response.body.data).toHaveLength(0);
    expect(response.body.total).toBe(0);
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
      response.body.data.map((o: { receiptNo: string }) => o.receiptNo),
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

/**
 * A void is the sale's mirror, and every assertion here checks that the mirror
 * reflects exactly: the receipt flips once, the stock returns, the ledger says
 * who did it and why, and the second attempt cannot re-mirror anything.
 */
describe('POST /api/orders/:id/void', () => {
  let latteId = '';

  beforeEach(async () => {
    const latte = await ProductModel.findOne({
      name: 'Classic Iced Caffe Latte',
    });
    latteId = String(latte!._id);
  });

  async function sellLine(
    productId: string,
    qty: number,
  ): Promise<{ id: string; receiptNo: string }> {
    const created = await kasir.agent
      .post('/api/orders')
      .send({
        lines: [{ productId, qty }],
        paymentMethod: 'qris',
        // Paid amounts only need to cover a single line, so each call buys the
        // same product at the fixture prices.
        paidAmount: productId === waterId ? 16500 : 61600,
      })
      .expect(201);
    return {
      id: created.body.order.id,
      receiptNo: created.body.order.receiptNo,
    };
  }

  it('refuses a kasir, and leaves the sale untouched', async () => {
    const sale = await sellLine(latteId, 1);

    const response = await kasir.agent
      .post(`/api/orders/${sale.id}/void`)
      .send({ reason: 'Customer left before pickup' })
      .expect(403);

    expect(response.body.error).toBe('forbidden');

    const order = await OrderModel.findById(sale.id);
    expect(order?.status).toBe('paid');

    const milk = await IngredientModel.findById(milkId);
    expect(milk?.stock).toBe(1000 - 180); // Nothing was put back.
  });

  it('requires a session', async () => {
    const sale = await sellLine(latteId, 1);
    await request(app).post(`/api/orders/${sale.id}/void`).send({ reason: 'No one here' }).expect(401);
  });

  it('requires a usable reason', async () => {
    const sale = await sellLine(latteId, 1);

    await admin.agent.post(`/api/orders/${sale.id}/void`).send({ reason: '' }).expect(422);
    await admin.agent.post(`/api/orders/${sale.id}/void`).send({ reason: 'x' }).expect(422);

    const order = await OrderModel.findById(sale.id);
    expect(order?.status).toBe('paid');
  });

  it('reverses a recipe sale in one transaction', async () => {
    const sale = await sellLine(latteId, 2);

    const response = await admin.agent
      .post(`/api/orders/${sale.id}/void`)
      .send({ reason: 'Barista rang up the wrong order' })
      .expect(200);

    const { order, movements, warnings } = response.body;

    expect(order.status).toBe('voided');
    expect(order.voidedByName).toBe('Budi Santoso');
    expect(order.voidReason).toBe('Barista rang up the wrong order');
    expect(order.voidedAt).toBeTruthy();
    expect(warnings).toEqual([]);

    // Two recipe lines consumed — mirrored by two positive void rows.
    expect(movements).toHaveLength(2);
    for (const movement of movements as Array<{
      type: string;
      qty: number;
      note: string;
    }>) {
      expect(movement.type).toBe('void');
      expect(movement.qty).toBeGreaterThan(0);
      expect(movement.note).toBe(
        `Voided ${sale.receiptNo} — Barista rang up the wrong order`.slice(0, 240),
      );
    }

    const milk = await IngredientModel.findById(milkId);
    const beans = await IngredientModel.findById(beansId);
    expect(milk?.stock).toBe(1000); // 360 ml put back where 360 ml were taken.
    expect(beans?.stock).toBe(5000);
  });

  it('reverses a direct sale in pcs', async () => {
    const sale = await sellLine(waterId, 3);

    const response = await admin.agent
      .post(`/api/orders/${sale.id}/void`)
      .send({ reason: 'Not collected' })
      .expect(200);

    expect(response.body.movements[0].type).toBe('void');
    expect(response.body.movements[0].qty).toBe(3);
    expect(response.body.movements[0].unit).toBe('pcs');
    expect(response.body.movements[0].productId).toBe(waterId);

    const water = await ProductModel.findById(waterId);
    expect(water?.stock).toBe(10);
  });

  it('refuses a second void and restores nothing twice', async () => {
    const sale = await sellLine(waterId, 3);
    await admin.agent
      .post(`/api/orders/${sale.id}/void`)
      .send({ reason: 'Not collected' })
      .expect(200);

    const response = await admin.agent
      .post(`/api/orders/${sale.id}/void`)
      .send({ reason: 'Not collected, again' })
      .expect(409);

    expect(response.body.reason).toBe('order-already-voided');

    // The first void already put the water back; the refusal must not double it.
    const water = await ProductModel.findById(waterId);
    expect(water?.stock).toBe(10);
    expect(
      await StockMovementModel.countDocuments({ type: 'void', productId: waterId }),
    ).toBe(1);
  });

  it('answers 404 for a receipt that never existed', async () => {
    await admin.agent
      .post('/api/orders/64b7f9c2e1a2b3c4d5e6f7a8/void')
      .send({ reason: 'Wrong id' })
      .expect(404);
  });

  it('warns instead of guessing when the catalogue can no longer express the sale', async () => {
    // The direct product is deleted after the sale. Its line can be reversed on
    // paper, but there is no product document to put stock back into.
    const sale = await sellLine(waterId, 3);
    await ProductModel.deleteOne({ _id: waterId });

    const response = await admin.agent
      .post(`/api/orders/${sale.id}/void`)
      .send({ reason: 'Rang up twice by mistake' })
      .expect(200);

    expect(response.body.warnings).toEqual([
      'Mineral Water was deleted since this sale, so its stock could not be restored.',
    ]);
    // No movement is invented for stock that was never restored.
    expect(response.body.movements).toEqual([]);

    const order = await OrderModel.findById(sale.id);
    expect(order?.status).toBe('voided');
  });

  it('warns when the stock mode changed after the sale', async () => {
    const sale = await sellLine(waterId, 3);

    await ProductModel.updateOne(
      { _id: waterId },
      { $set: { stockMode: 'recipe', recipe: [{ ingredientId: milkId, qty: 10 }] }, $unset: { stock: '' } },
    );

    const response = await admin.agent
      .post(`/api/orders/${sale.id}/void`)
      .send({ reason: 'Rang up twice by mistake' })
      .expect(200);

    expect(response.body.warnings).toEqual([
      'Mineral Water changed stockMode since this sale, so its stock could not be restored.',
    ]);
    expect(response.body.movements).toEqual([]);
  });
});

describe('the void filter on GET /api/orders', () => {
  it('keeps voided receipts listable and filterable', async () => {
    const latte = await ProductModel.findOne({
      name: 'Classic Iced Caffe Latte',
    });

    const first = await kasir.agent
      .post('/api/orders')
      .send({
        lines: [{ productId: String(latte!._id), qty: 1 }],
        paymentMethod: 'qris',
        paidAmount: 61600,
      })
      .expect(201);
    await kasir.agent
      .post('/api/orders')
      .send({
        lines: [{ productId: waterId, qty: 1 }],
        paymentMethod: 'qris',
        paidAmount: 16500,
      })
      .expect(201);

    await admin.agent
      .post(`/api/orders/${first.body.order.id}/void`)
      .send({ reason: 'Wrong product' })
      .expect(200);

    const all = await kasir.agent.get('/api/orders').expect(200);
    expect(all.body.total).toBe(2);
    expect(all.body.data).toHaveLength(2);
    const statuses = all.body.data
      .map((o: { status: string }) => o.status)
      .sort();
    expect(statuses).toEqual(['paid', 'voided']);

    const paid = await kasir.agent.get('/api/orders?status=paid').expect(200);
    expect(paid.body.total).toBe(1);
    expect(paid.body.data[0].paymentMethod).toBe('qris');
    expect(paid.body.data[0].lines[0].name).toBe('Mineral Water');

    const voided = await kasir.agent
      .get('/api/orders?status=voided')
      .expect(200);
    expect(voided.body.data).toHaveLength(1);
    expect(voided.body.data[0].receiptNo).toBe(first.body.order.receiptNo);

    await kasir.agent.get('/api/orders?status=refunded').expect(422);
  });
});

/**
 * A growing day book is the reason the list endpoint pages at all: the screen
 * loads one window at a time, and every row beyond `limit` is a decision the
 * caller takes deliberately by asking for the next offset.
 */
describe('pagination on GET /api/orders', () => {
  beforeEach(async () => {
    for (let n = 0; n < 5; n += 1) {
      await OrderModel.create({
        receiptNo: `MOKA-71${n}0`,
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
        // Method variety so a method filter is provable in the same fixture.
        paymentMethod: n % 2 === 0 ? 'cash' : 'qris',
        paidAmount: 5500,
        changeAmount: 0,
        cashierId: kasir.user.id,
        cashierName: 'Siti Rahayu',
        createdAt: new Date(`2026-10-1${n + 1}T03:00:00Z`),
      });
    }
  });

  it('pages without losing count', async () => {
    const page = await kasir.agent
      .get('/api/orders?limit=2&offset=0')
      .expect(200);

    expect(page.body.total).toBe(5);
    expect(page.body.limit).toBe(2);
    expect(page.body.offset).toBe(0);
    expect(page.body.data).toHaveLength(2);
    // Newest first: the reply window is the top of the sorted ledger.
    expect(page.body.data.map((o: { receiptNo: string }) => o.receiptNo)).toEqual([
      'MOKA-7140',
      'MOKA-7130',
    ]);
  });

  it('walks to the end of the ledger', async () => {
    const last = await kasir.agent
      .get('/api/orders?limit=2&offset=4')
      .expect(200);

    expect(last.body.total).toBe(5);
    expect(last.body.data).toHaveLength(1);
    // The fifth and oldest row of the newest-first ordering.
    expect(last.body.data[0].receiptNo).toBe('MOKA-7100');
  });

  it('counts the filtered set, not the page', async () => {
    // Three of the five fixture rows are cash. Pagination has not happened;
    // the filter has, and `total` has to say 3 whatever window is served.
    const cash = await kasir.agent
      .get('/api/orders?method=cash&limit=1&offset=2')
      .expect(200);

    expect(cash.body.total).toBe(3);
    expect(cash.body.data).toHaveLength(1);
    expect(cash.body.data[0].paymentMethod).toBe('cash');
  });

  it('searches how a customer quotes a sale back', async () => {
    await OrderModel.create({
      receiptNo: 'MOKA-7099',
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
      paymentMethod: 'debit',
      paidAmount: 5500,
      changeAmount: 0,
      cashierId: kasir.user.id,
      cashierName: 'Siti Rahayu',
      customer: { name: 'Andi Wijaya', phone: '+62 812 7000 123' },
      createdAt: new Date('2026-10-16T04:00:00Z'),
    });

    const byReceipt = await kasir.agent
      .get('/api/orders?q=7099')
      .expect(200);
    expect(byReceipt.body.total).toBe(1);
    expect(byReceipt.body.data[0].receiptNo).toBe('MOKA-7099');

    const byName = await kasir.agent.get('/api/orders?q=andi').expect(200);
    expect(byName.body.total).toBe(1);
    expect(byName.body.data[0].customer?.name).toBe('Andi Wijaya');

    // The customer said "zero seven", not "+62 812 7000 123"; either should hit.
    const byPhone = await kasir.agent.get('/api/orders?q=812').expect(200);
    expect(byPhone.body.total).toBe(1);
  });

  it('cannot be coerced past its bounds', async () => {
    await kasir.agent.get('/api/orders?limit=101').expect(422);
    await kasir.agent.get('/api/orders?limit=0').expect(422);
    await kasir.agent.get('/api/orders?offset=-1').expect(422);
    await kasir.agent.get('/api/orders?limit=abc').expect(422);
  });
});
