import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { CategoryModel } from '../src/models/category.model.js';
import { IngredientModel } from '../src/models/ingredient.model.js';
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
 * Stock is admin-only throughout, mirroring the frontend's `/dashboard/inventory`
 * nav entry. The single-writer rule is the property worth defending: a level and
 * the ledger row explaining it must move together or not at all.
 */

const app: Express = createApp();

let admin: Awaited<ReturnType<typeof agentFor>>;
let kasir: Awaited<ReturnType<typeof agentFor>>;

let beansId = '';
let waterId = '';
let latteId = '';

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
  beansId = String(beans._id);

  await ProductModel.create({
    name: 'Classic Iced Caffe Latte',
    categoryId: coffee._id,
    price: 28000,
    image: '/menu/coffee/classic_iced_latte.svg',
    stockMode: 'recipe',
    recipe: [{ ingredientId: beans._id, qty: 18 }],
    isActive: true,
  });

  const water = await ProductModel.create({
    name: 'Mineral Water',
    categoryId: retail._id,
    price: 5000,
    image: '/menu/retail/mineral_water.svg',
    stockMode: 'direct',
    stock: 36,
    minStock: 24,
    recipe: [],
    isActive: true,
  });
  waterId = String(water._id);

  const latte = await ProductModel.findOne({
    name: 'Classic Iced Caffe Latte',
  });
  latteId = String(latte!._id);
});

describe('access', () => {
  it('refuses a cashier, who has no stock screen', async () => {
    await kasir.agent.get('/api/stock/movements').expect(403);
    await kasir.agent.get('/api/stock/value').expect(403);
    await kasir.agent
      .get(`/api/stock/level?target=product&targetId=${waterId}`)
      .expect(403);
    await kasir.agent
      .post('/api/stock/adjust')
      .send({
        target: 'product',
        targetId: waterId,
        type: 'waste',
        qty: -1,
        note: 'oops',
      })
      .expect(403);
  });

  it('refuses an anonymous request', async () => {
    await request(app).get('/api/stock/value').expect(401);
  });
});

describe('POST /api/stock/adjust', () => {
  it('records a delivery and raises the level', async () => {
    const response = await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'purchase',
        qty: 2000,
        note: 'Delivery from supplier, invoice 2041',
      })
      .expect(201);

    expect(response.body.type).toBe('purchase');
    expect(response.body.qty).toBe(2000);
    expect(response.body.unit).toBe('gram');
    expect(response.body.label).toBe('House Blend Beans');

    // The actor comes from the session, not the body.
    expect(response.body.byUserName).toBe('Budi Santoso');

    expect((await IngredientModel.findById(beansId))?.stock).toBe(7000);
  });

  it('records waste as a negative movement', async () => {
    await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'waste',
        qty: -250,
        note: 'Spilled',
      })
      .expect(201);

    expect((await IngredientModel.findById(beansId))?.stock).toBe(4750);
    const movement = await StockMovementModel.findOne({ type: 'waste' });
    expect(movement?.qty).toBe(-250);
  });

  it('rejects a purchase whose sign says stock leaves', async () => {
    const response = await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'purchase',
        qty: -10,
        note: 'Delivery',
      })
      .expect(422);

    expect(response.body.fields).toHaveProperty('qty');
    expect(await StockMovementModel.countDocuments()).toBe(0);
    expect((await IngredientModel.findById(beansId))?.stock).toBe(5000);
  });

  it('rejects waste whose sign says stock arrives', async () => {
    const response = await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'waste',
        qty: 10,
        note: 'Spilled',
      })
      .expect(422);

    expect(response.body.fields).toHaveProperty('qty');
    expect(await StockMovementModel.countDocuments()).toBe(0);
    expect((await IngredientModel.findById(beansId))?.stock).toBe(5000);
  });

  it('accepts a signed correction in either direction', async () => {
    await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'adjustment',
        qty: -100,
        note: 'Stocktake shortfall',
      })
      .expect(201);
    await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'adjustment',
        qty: 250,
        note: 'Found in the store room',
      })
      .expect(201);

    expect((await IngredientModel.findById(beansId))?.stock).toBe(5150);

    const movements = await StockMovementModel.find({ type: 'adjustment' })
      .sort({ qty: 1 })
      .lean();
    expect(movements.map((movement) => movement.qty)).toEqual([-100, 250]);
  });

  it('refuses to drive stock negative, and says how much is on hand', async () => {
    const response = await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'waste',
        qty: -9999,
        note: 'typo',
      })
      .expect(422);

    expect(response.body.error).toBe('validation');
    // The stock screen shows this message, so it has to carry the number.
    expect(response.body.message).toMatch(/only 5000 on hand/);
  });

  /**
   * A refused adjustment must not leave a ledger row behind, or the audit trail
   * would claim something that never happened.
   */
  it('writes no ledger row when it refuses', async () => {
    await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'waste',
        qty: -9999,
        note: 'typo',
      })
      .expect(422);

    expect(await StockMovementModel.countDocuments()).toBe(0);
    expect((await IngredientModel.findById(beansId))?.stock).toBe(5000);
  });

  it('rejects type "sale", which belongs to POST /api/orders', async () => {
    await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'sale',
        qty: -100,
        note: 'x',
      })
      .expect(422);
  });

  it('rejects a zero quantity, which would be a silent no-op', async () => {
    await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'adjustment',
        qty: 0,
        note: 'x',
      })
      .expect(422);
  });

  it('refuses to adjust a recipe product, which has no stock of its own', async () => {
    const response = await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'product',
        targetId: latteId,
        type: 'adjustment',
        qty: 5,
        note: 'x',
      })
      .expect(422);

    expect(response.body.message).toMatch(/recipe/i);
  });

  it('adjusts a direct product in pcs', async () => {
    await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'product',
        targetId: waterId,
        type: 'waste',
        qty: -2,
        note: 'broken bottle',
      })
      .expect(201);

    expect((await ProductModel.findById(waterId))?.stock).toBe(34);
    const movement = await StockMovementModel.findOne({ type: 'waste' });
    expect(movement?.unit).toBe('pcs');
    expect(movement?.productId).toBeTruthy();
  });

  it('ignores an actor named in the body', async () => {
    await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: beansId,
        type: 'purchase',
        qty: 100,
        note: 'x',
        actor: { id: kasir.user.id, name: 'Someone Else' },
      })
      .expect(201);

    const movement = await StockMovementModel.findOne({ type: 'purchase' });
    expect(movement?.byUserName).toBe('Budi Santoso');
  });

  it('404s an unknown ingredient', async () => {
    await admin.agent
      .post('/api/stock/adjust')
      .send({
        target: 'ingredient',
        targetId: '64b7f9c2e1a2b3c4d5e6f7a8',
        type: 'purchase',
        qty: 10,
        note: 'x',
      })
      .expect(404);
  });
});

describe('GET /api/stock/level', () => {
  it('returns an ingredient level', async () => {
    const response = await admin.agent
      .get(`/api/stock/level?target=ingredient&targetId=${beansId}`)
      .expect(200);

    expect(response.body).toBe(5000);
  });

  it('returns null for a recipe product rather than 0', async () => {
    // 0 would read as "out of stock" and block a drink that is perfectly
    // sellable — its availability lives in its ingredients.
    const response = await admin.agent
      .get(`/api/stock/level?target=product&targetId=${latteId}`)
      .expect(200);

    expect(response.body).toBeNull();
  });

  it('returns a direct product level', async () => {
    const response = await admin.agent
      .get(`/api/stock/level?target=product&targetId=${waterId}`)
      .expect(200);

    expect(response.body).toBe(36);
  });
});

describe('GET /api/stock/value', () => {
  it('values ingredients at cost and retail stock at selling price', async () => {
    const response = await admin.agent.get('/api/stock/value').expect(200);

    // 5000 g at 380 = 1,900,000.
    expect(response.body.ingredientsValue).toBe(1900000);
    // 36 pcs at 5,000 = 180,000. Direct products have no cost field, so this is
    // retail value, not cost — reported separately for exactly that reason.
    expect(response.body.retailValue).toBe(180000);
    expect(response.body.total).toBe(2080000);
  });

  it('rounds to whole rupiah', async () => {
    await IngredientModel.updateOne(
      { _id: beansId },
      { $set: { stock: 1, costPerUnit: 0.5 } },
    );

    const response = await admin.agent.get('/api/stock/value').expect(200);

    expect(Number.isInteger(response.body.ingredientsValue)).toBe(true);
    expect(Number.isInteger(response.body.retailValue)).toBe(true);
    expect(Number.isInteger(response.body.total)).toBe(true);
  });
});

describe('GET /api/stock/movements', () => {
  beforeEach(async () => {
    await admin.agent.post('/api/stock/adjust').send({
      target: 'ingredient',
      targetId: beansId,
      type: 'purchase',
      qty: 100,
      note: 'first',
    });
    await admin.agent.post('/api/stock/adjust').send({
      target: 'product',
      targetId: waterId,
      type: 'waste',
      qty: -1,
      note: 'second',
    });
  });

  it('returns newest first', async () => {
    const response = await admin.agent.get('/api/stock/movements').expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0].note).toBe('second');
  });

  it('filters by type', async () => {
    const response = await admin.agent
      .get('/api/stock/movements?type=purchase')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].type).toBe('purchase');
  });

  it('filters by ingredient and by product', async () => {
    const byIngredient = await admin.agent
      .get(`/api/stock/movements?ingredientId=${beansId}`)
      .expect(200);
    const byProduct = await admin.agent
      .get(`/api/stock/movements?productId=${waterId}`)
      .expect(200);

    expect(byIngredient.body).toHaveLength(1);
    expect(byProduct.body).toHaveLength(1);
  });

  it('reads correctly after the ingredient is renamed', async () => {
    await IngredientModel.updateOne(
      { _id: beansId },
      { $set: { name: 'Single-Origin Beans' } },
    );

    const response = await admin.agent.get('/api/stock/movements').expect(200);

    // `label` is denormalised at write time, which is the point.
    expect(
      response.body.some(
        (m: { label: string }) => m.label === 'House Blend Beans',
      ),
    ).toBe(true);
  });
});
