import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import { CategoryModel } from '../src/models/category.model.js';
import { IngredientModel } from '../src/models/ingredient.model.js';
import { ProductModel } from '../src/models/product.model.js';
import {
  agentFor,
  createUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
  TEST_PASSWORD,
} from './helpers/mongo.js';

/**
 * The catalogue. Two things dominate here: every write is admin-only, and the
 * recipe/direct split is enforced consistently, because a recipe product that
 * also carries a stock level is a product that can oversell while looking fine.
 */

const app: Express = createApp();

let admin: Awaited<ReturnType<typeof agentFor>>;
let kasir: Awaited<ReturnType<typeof agentFor>>;
let coffeeId = '';
let beansId = '';
let milkId = '';

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();

  // The accounts `agentFor` signs in as. Created first so the login is real
  // rather than stubbed.
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
  const snack = await CategoryModel.create({ name: 'Snack', sortOrder: 2 });
  coffeeId = String(coffee._id);

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
    stock: 6000,
    minStock: 2000,
    costPerUnit: 16,
  });
  beansId = String(beans._id);
  milkId = String(milk._id);

  await ProductModel.create({
    name: 'Mineral Water',
    categoryId: snack._id,
    price: 5000,
    image: '/menu/retail/mineral_water.svg',
    stockMode: 'direct',
    stock: 36,
    minStock: 24,
    recipe: [],
    isActive: true,
  });
});

/**
 * A recipe-mode product, built on demand.
 *
 * A function rather than an object literal because the ids are assigned in
 * `beforeEach`, which runs after test collection — an object built at
 * describe-time would capture the initial empty strings and every test would
 * fail casting `""` to an ObjectId.
 */
function recipeProduct() {
  return {
    name: 'Classic Iced Caffe Latte',
    categoryId: coffeeId,
    price: 28000,
    image: '/menu/coffee/classic_iced_latte.svg',
    stockMode: 'recipe' as const,
    recipe: [
      { ingredientId: beansId, qty: 18 },
      { ingredientId: milkId, qty: 180 },
    ],
    isActive: true,
  };
}

describe('authentication and authorisation', () => {
  it('refuses an anonymous catalogue read', async () => {
    await request(app).get('/api/products').expect(401);
  });

  it('lets a kasir read the menu, because the POS grid needs it', async () => {
    await kasir.agent.get('/api/products').expect(200);
    await kasir.agent.get('/api/categories').expect(200);
    await kasir.agent.get('/api/ingredients').expect(200);
  });

  it('refuses a kasir any write, even with a valid session', async () => {
    // Each request is built lazily inside the loop rather than collected into an
    // array first: supertest binds the server when a Test is constructed, and
    // holding several at once loses that reference.
    const attempts: { label: string; build: () => request.Test }[] = [
      {
        label: 'POST /api/categories',
        build: () =>
          kasir.agent.post('/api/categories').send({ name: 'Merch' }),
      },
      {
        label: 'PUT /api/categories/:id',
        build: () =>
          kasir.agent
            .put(`/api/categories/${coffeeId}`)
            .send({ name: 'Renamed' }),
      },
      {
        label: 'DELETE /api/categories/:id',
        build: () => kasir.agent.delete(`/api/categories/${coffeeId}`),
      },
      {
        label: 'PUT /api/categories/order',
        build: () =>
          kasir.agent.put('/api/categories/order').send({ ids: [coffeeId] }),
      },
      {
        label: 'POST /api/ingredients',
        build: () =>
          kasir.agent.post('/api/ingredients').send({
            name: 'Vanilla',
            unit: 'ml',
            minStock: 0,
            costPerUnit: 10,
          }),
      },
      {
        label: 'PUT /api/ingredients/:id',
        build: () =>
          kasir.agent.put(`/api/ingredients/${milkId}`).send({
            name: 'Renamed Milk',
            unit: 'ml',
            minStock: 0,
            costPerUnit: 16,
          }),
      },
      {
        label: 'POST /api/products',
        build: () => kasir.agent.post('/api/products').send(recipeProduct()),
      },
      {
        label: 'PUT /api/products/:id',
        build: () => kasir.agent.put('/api/products/abc').send(recipeProduct()),
      },
      {
        label: 'PATCH /api/products/:id/active',
        build: () =>
          kasir.agent
            .patch('/api/products/abc/active')
            .send({ isActive: false }),
      },
      {
        label: 'DELETE /api/products/:id',
        build: () => kasir.agent.delete('/api/products/abc'),
      },
    ];

    for (const { label, build } of attempts) {
      const response = await build().expect(403);
      expect(response.body.error, label).toBe('forbidden');
    }
  });

  it('rejects a forged cookie rather than treating it as anonymous', async () => {
    const response = await request(app)
      .get('/api/products')
      .set('Cookie', 'moka_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.')
      .expect(401);

    expect(response.body.error).toBe('unauthenticated');
  });
});

describe('categories', () => {
  it('lists in display order, not insertion order', async () => {
    const response = await admin.agent.get('/api/categories').expect(200);

    expect(response.body.map((c: { name: string }) => c.name)).toEqual([
      'Coffee',
      'Snack',
    ]);
  });

  it('appends a new category to the end of the display order', async () => {
    const response = await admin.agent
      .post('/api/categories')
      .send({ name: 'Merchandise' })
      .expect(201);

    expect(response.body.sortOrder).toBe(3);
  });

  it('honours an explicit sortOrder', async () => {
    const response = await admin.agent
      .post('/api/categories')
      .send({ name: 'Merchandise', sortOrder: 0 })
      .expect(201);

    expect(response.body.sortOrder).toBe(0);
  });

  it('leaves the position alone when an update omits sortOrder', async () => {
    const response = await admin.agent
      .put(`/api/categories/${coffeeId}`)
      .send({ name: 'Coffee Beans' })
      .expect(200);

    expect(response.body.name).toBe('Coffee Beans');
    expect(response.body.sortOrder).toBe(1);
  });

  it('reorders and returns the new order', async () => {
    const snack = await CategoryModel.findOne({ name: 'Snack' });

    const response = await admin.agent
      .put('/api/categories/order')
      .send({ ids: [String(snack!._id), coffeeId] })
      .expect(200);

    expect(response.body.map((c: { name: string }) => c.name)).toEqual([
      'Snack',
      'Coffee',
    ]);
  });

  /**
   * `/categories/order` and `/categories/:id` collide unless the literal route is
   * declared first. Registered the other way round, this answers 422 about an id
   * the caller never sent.
   */
  it('routes /order to the reorder handler, not to :id', async () => {
    const response = await admin.agent
      .put('/api/categories/order')
      .send({ ids: [coffeeId] })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('refuses to delete a category that still has products', async () => {
    // Snack, not Coffee — Mineral Water is the only product in the fixture, so
    // Coffee is empty and deleting it legitimately succeeds.
    const snack = await CategoryModel.findOne({ name: 'Snack' });

    const response = await admin.agent
      .delete(`/api/categories/${String(snack!._id)}`)
      .expect(409);

    expect(response.body.error).toBe('conflict');
    expect(response.body.reason).toBe('category-in-use');
    expect(response.body.message).toMatch(/products/i);
  });

  it('allows deleting a category with no products', async () => {
    await admin.agent.delete(`/api/categories/${coffeeId}`).expect(204);
  });

  it('deletes an empty category', async () => {
    const created = await admin.agent
      .post('/api/categories')
      .send({ name: 'Merchandise' })
      .expect(201);

    await admin.agent.delete(`/api/categories/${created.body.id}`).expect(204);

    expect(await CategoryModel.findById(created.body.id)).toBeNull();
  });

  it('404s an unknown category', async () => {
    const response = await admin.agent
      .delete('/api/categories/64b7f9c2e1a2b3c4d5e6f7a8')
      .expect(404);

    expect(response.body.error).toBe('not-found');
  });

  it('422s a malformed id rather than reaching the database', async () => {
    const response = await admin.agent
      .delete('/api/categories/not-an-id')
      .expect(422);

    expect(response.body.error).toBe('validation');
    expect(response.body.fields).toHaveProperty('id');
  });
});

describe('ingredients', () => {
  it('lists alphabetically', async () => {
    await IngredientModel.create({
      name: 'Boba Pearls',
      unit: 'gram',
      stock: 800,
      minStock: 300,
      costPerUnit: 3,
    });

    const response = await admin.agent.get('/api/ingredients').expect(200);

    expect(response.body.map((i: { name: string }) => i.name)).toEqual([
      'Boba Pearls',
      'Fresh Milk',
      'House Blend Beans',
    ]);
  });

  /**
   * Opening stock goes through a `purchase` movement, so every unit on hand has
   * a ledger entry. Accepting a level here would create stock no movement
   * explains.
   */
  it('starts a new ingredient at zero stock, whatever the caller sends', async () => {
    const response = await admin.agent
      .post('/api/ingredients')
      .send({
        name: 'Boba Pearls',
        unit: 'gram',
        minStock: 300,
        costPerUnit: 3,
        stock: 9999,
      })
      .expect(201);

    expect(response.body.stock).toBe(0);
  });

  it('rejects an unknown unit', async () => {
    const response = await admin.agent
      .post('/api/ingredients')
      .send({ name: 'Milk', unit: 'litre', minStock: 0, costPerUnit: 16 })
      .expect(422);

    expect(response.body.error).toBe('validation');
    expect(response.body.fields).toHaveProperty('unit');
  });

  it('never changes stock through an update', async () => {
    const before = await IngredientModel.findOne({ name: 'Fresh Milk' });

    const response = await admin.agent
      .put(`/api/ingredients/${milkId}`)
      .send({
        name: 'Fresh Milk XL',
        unit: 'ml',
        minStock: 2500,
        costPerUnit: 17,
        stock: 0,
      })
      .expect(200);

    expect(response.body.name).toBe('Fresh Milk XL');
    expect(response.body.stock).toBe(before!.stock);
  });

  it('has no delete route', async () => {
    await admin.agent.delete(`/api/ingredients/${beansId}`).expect(404);
  });

  it('404s an unknown ingredient', async () => {
    const response = await admin.agent
      .get('/api/ingredients/64b7f9c2e1a2b3c4d5e6f7a8')
      .expect(404);

    expect(response.body.error).toBe('not-found');
  });
});

describe('products', () => {
  it('creates a recipe product with no stock of its own', async () => {
    const response = await admin.agent
      .post('/api/products')
      .send(recipeProduct())
      .expect(201);

    expect(response.body.stockMode).toBe('recipe');
    expect(response.body).not.toHaveProperty('stock');
    expect(response.body.recipe).toHaveLength(2);
  });

  it('creates a direct product with stock and an empty recipe', async () => {
    const snack = await CategoryModel.findOne({ name: 'Snack' });

    const response = await admin.agent
      .post('/api/products')
      .send({
        name: 'Butter Croissant',
        categoryId: String(snack!._id),
        price: 22000,
        image: '/menu/snack/butter_croissant.svg',
        stockMode: 'direct',
        stock: 9,
        minStock: 12,
        recipe: [],
        isActive: true,
      })
      .expect(201);

    expect(response.body.stock).toBe(9);
    expect(response.body.recipe).toEqual([]);
  });

  it('discards a recipe supplied to a direct product', async () => {
    const snack = await CategoryModel.findOne({ name: 'Snack' });

    const response = await admin.agent
      .post('/api/products')
      .send({
        name: 'Butter Croissant',
        categoryId: String(snack!._id),
        price: 22000,
        image: '/menu/snack/butter_croissant.svg',
        stockMode: 'direct',
        stock: 9,
        minStock: 12,
        recipe: [{ ingredientId: beansId, qty: 18 }],
      })
      .expect(201);

    expect(response.body.recipe).toEqual([]);
  });

  describe('recipe validation', () => {
    it('rejects a recipe product with no ingredients', async () => {
      const response = await admin.agent
        .post('/api/products')
        .send({ ...recipeProduct(), recipe: [] })
        .expect(422);

      expect(response.body.error).toBe('validation');
      expect(response.body.fields).toHaveProperty('recipe');
    });

    it('rejects the same ingredient twice', async () => {
      const response = await admin.agent
        .post('/api/products')
        .send({
          ...recipeProduct(),
          recipe: [
            { ingredientId: beansId, qty: 18 },
            { ingredientId: beansId, qty: 10 },
          ],
        })
        .expect(422);

      expect(response.body.error).toBe('validation');
    });

    it('rejects a zero or negative quantity', async () => {
      await admin.agent
        .post('/api/products')
        .send({
          ...recipeProduct(),
          recipe: [{ ingredientId: beansId, qty: 0 }],
        })
        .expect(422);
    });

    it('rejects an ingredient that does not exist', async () => {
      const response = await admin.agent
        .post('/api/products')
        .send({
          ...recipeProduct(),
          recipe: [{ ingredientId: '64b7f9c2e1a2b3c4d5e6f7a8', qty: 18 }],
        })
        .expect(422);

      expect(response.body.fields).toHaveProperty('recipe');
    });
  });

  describe('money', () => {
    it('rejects a fractional price', async () => {
      const response = await admin.agent
        .post('/api/products')
        .send({ ...recipeProduct(), price: 28000.5 })
        .expect(422);

      expect(response.body.fields).toHaveProperty('price');
      expect(response.body.fields.price).toMatch(/whole number/i);
    });

    it('rejects a negative price', async () => {
      await admin.agent
        .post('/api/products')
        .send({ ...recipeProduct(), price: -1 })
        .expect(422);
    });

    it('stores and returns integer rupiah exactly', async () => {
      const response = await admin.agent
        .post('/api/products')
        .send({ ...recipeProduct(), price: 28000 })
        .expect(201);

      expect(response.body.price).toBe(28000);
    });
  });

  it('rejects a category that does not exist', async () => {
    const response = await admin.agent
      .post('/api/products')
      .send({ ...recipeProduct(), categoryId: '64b7f9c2e1a2b3c4d5e6f7a8' })
      .expect(422);

    expect(response.body.fields).toHaveProperty('categoryId');
  });

  describe('stockMode switch', () => {
    it('clears the fields the new mode does not use', async () => {
      const created = await admin.agent
        .post('/api/products')
        .send(recipeProduct())
        .expect(201);

      // Switch it to a counted good. A stale recipe left behind would look like
      // data loss to whoever opened the product next.
      const response = await admin.agent
        .put(`/api/products/${created.body.id}`)
        .send({
          name: 'Classic Iced Caffe Latte',
          categoryId: coffeeId,
          price: 28000,
          image: '/menu/coffee/classic_iced_latte.svg',
          stockMode: 'direct',
          stock: 12,
          minStock: 4,
        })
        .expect(200);

      expect(response.body.recipe).toEqual([]);
      expect(response.body.stock).toBe(12);

      const stored = await ProductModel.findById(created.body.id);
      expect(stored?.recipe).toHaveLength(0);
    });
  });

  describe('listing', () => {
    beforeEach(async () => {
      await ProductModel.create({ ...recipeProduct() });
      await admin.agent
        .post('/api/products')
        .send({ ...recipeProduct(), name: 'Hidden Brew', isActive: false });
    });

    it('hides inactive products by default', async () => {
      const response = await admin.agent.get('/api/products').expect(200);
      const names = response.body.map((p: { name: string }) => p.name);

      expect(names).toContain('Classic Iced Caffe Latte');
      expect(names).not.toContain('Hidden Brew');
    });

    /**
     * `includeInactive=false` arrives as the *string* "false", which is truthy.
     * Without coercion this would return the hidden product every time.
     */
    it('coerces includeInactive=false to a real boolean', async () => {
      const response = await admin.agent
        .get('/api/products?includeInactive=false')
        .expect(200);

      expect(response.body.map((p: { name: string }) => p.name)).not.toContain(
        'Hidden Brew',
      );
    });

    it('includes inactive products when asked', async () => {
      const response = await admin.agent
        .get('/api/products?includeInactive=true')
        .expect(200);

      expect(response.body.map((p: { name: string }) => p.name)).toContain(
        'Hidden Brew',
      );
    });

    it('filters by category', async () => {
      const snack = await CategoryModel.findOne({ name: 'Snack' });
      const response = await admin.agent
        .get(`/api/products?categoryId=${String(snack!._id)}`)
        .expect(200);

      expect(response.body.map((p: { name: string }) => p.name)).toEqual([
        'Mineral Water',
      ]);
    });

    it('searches names case-insensitively', async () => {
      const response = await admin.agent
        .get('/api/products?includeInactive=true&search=LATTE')
        .expect(200);

      expect(response.body.map((p: { name: string }) => p.name)).toEqual([
        'Classic Iced Caffe Latte',
      ]);
    });

    it('treats regex metacharacters as literal text', async () => {
      const response = await admin.agent
        .get('/api/products?includeInactive=true&search=.*')
        .expect(200);

      // Escaped, so `.*` finds a product actually named ".*" — which is none.
      expect(response.body).toEqual([]);
    });

    it('sorts alphabetically', async () => {
      const response = await admin.agent
        .get('/api/products?includeInactive=true')
        .expect(200);

      const names = response.body.map((p: { name: string }) => p.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
  });

  describe('active flag and deletion', () => {
    it('deactivates without deleting', async () => {
      const created = await admin.agent
        .post('/api/products')
        .send(recipeProduct())
        .expect(201);

      const response = await admin.agent
        .patch(`/api/products/${created.body.id}/active`)
        .send({ isActive: false })
        .expect(200);

      expect(response.body.isActive).toBe(false);
      // Still there — setActive is the reversible state.
      expect(await ProductModel.findById(created.body.id)).not.toBeNull();
    });

    it('deletes for real, keeping order lines intact', async () => {
      const created = await admin.agent
        .post('/api/products')
        .send(recipeProduct())
        .expect(201);
      await admin.agent.delete(`/api/products/${created.body.id}`).expect(204);

      expect(await ProductModel.findById(created.body.id)).toBeNull();
    });

    it('404s deleting the same product twice', async () => {
      const created = await admin.agent
        .post('/api/products')
        .send(recipeProduct())
        .expect(201);
      await admin.agent.delete(`/api/products/${created.body.id}`).expect(204);

      const response = await admin.agent
        .delete(`/api/products/${created.body.id}`)
        .expect(404);
      expect(response.body.error).toBe('not-found');
    });

    it('requires a boolean for the active flag', async () => {
      const created = await admin.agent
        .post('/api/products')
        .send(recipeProduct())
        .expect(201);

      await admin.agent
        .patch(`/api/products/${created.body.id}/active`)
        .send({ isActive: 'yes' })
        .expect(422);
    });
  });
});

describe('id shape', () => {
  it('exposes id and never _id or __v', async () => {
    const response = await admin.agent.get('/api/products').expect(200);

    for (const product of response.body) {
      expect(product.id).toMatch(/^[0-9a-f]{24}$/i);
      expect(product).not.toHaveProperty('_id');
      expect(product).not.toHaveProperty('__v');
    }
  });
});

describe('account hygiene', () => {
  it('verifies the kasir password against its stored hash', async () => {
    const { findByUsername } = await import('../src/models/user.model.js');
    const { verifyPassword } = await import('../src/lib/password.js');

    const user = await findByUsername('kasir').select('+passwordHash');

    expect(user?.passwordHash).not.toBe(TEST_PASSWORD);
    expect(await verifyPassword(TEST_PASSWORD, user!.passwordHash)).toBe(true);
  });
});
