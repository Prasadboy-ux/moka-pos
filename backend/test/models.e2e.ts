import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IngredientModel } from '../src/models/ingredient.model.js';
import { OrderModel } from '../src/models/order.model.js';
import { ProductModel } from '../src/models/product.model.js';
import { findByUsername, UserModel } from '../src/models/user.model.js';
import {
  createUser,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/mongo.js';

/**
 * The schema rules that are easy to get wrong and expensive to discover late:
 * id shape on the wire, password exclusion, case-insensitive uniqueness, and
 * the indexes the reports query depends on.
 *
 * Negative cases pass values the schema is supposed to reject, so they are cast
 * past the literal types on purpose. The cast is the assertion, not a bypass.
 */

type Never = 'gram' | 'ml' | 'pcs';
type NeverRole = 'admin' | 'kasir';

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('id serialisation', () => {
  it('exposes _id as an opaque string id and hides __v', async () => {
    const user = await createUser();
    const json = user.toJSON() as Record<string, unknown>;

    expect(json.id).toBe(String(user._id));
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
  });
});

describe('password handling', () => {
  it('omits passwordHash from a normal query', async () => {
    await createUser();
    const found = await UserModel.findOne({ username: 'admin' });

    expect(found).not.toBeNull();
    expect(found?.toJSON()).not.toHaveProperty('passwordHash');
  });

  it('still returns passwordHash when explicitly selected, for login', async () => {
    await createUser();
    const found = await findByUsername('admin').select('+passwordHash');

    expect(found?.passwordHash).toBe('not-a-real-hash');
  });
});

describe('username uniqueness', () => {
  it('finds a user regardless of case', async () => {
    await createUser({ username: 'kasir' });

    expect(await findByUsername('KASIR')).not.toBeNull();
    expect(await findByUsername('kAsIr')).not.toBeNull();
  });

  it('refuses a duplicate that differs only in case', async () => {
    await createUser({ username: 'kasir' });

    await expect(
      UserModel.create({
        name: 'Someone Else',
        username: 'KASIR',
        passwordHash: 'x',
        role: 'kasir',
      }),
    ).rejects.toThrow(/E11000|duplicate key/i);
  });
});

describe('constraints', () => {
  it('rejects negative stock on an ingredient', async () => {
    await expect(
      IngredientModel.create({
        name: 'Milk',
        unit: 'ml',
        stock: -1,
        minStock: 0,
        costPerUnit: 20,
      }),
    ).rejects.toThrow();
  });

  it('rejects an unknown unit', async () => {
    await expect(
      IngredientModel.create({
        name: 'Milk',
        // Cast: the literal union is the thing being violated.
        unit: 'litre' as Never,
        stock: 1,
        minStock: 0,
        costPerUnit: 20,
      }),
    ).rejects.toThrow();
  });

  it('rejects an unknown role', async () => {
    await expect(
      createUser({ role: 'manager' as NeverRole }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate receipt number', async () => {
    const cashier = await createUser();
    const order = {
      lines: [
        {
          productId: new mongoose.Types.ObjectId(),
          name: 'Iced Latte',
          price: 24000,
          qty: 1,
          stockMode: 'direct' as const,
        },
      ],
      subtotal: 24000,
      taxRate: 0.1,
      taxAmount: 2400,
      total: 26400,
      paymentMethod: 'cash' as const,
      paidAmount: 26400,
      changeAmount: 0,
      cashierId: cashier._id,
      cashierName: cashier.name,
    };

    await OrderModel.create({ ...order, receiptNo: 'MOKA-0001' });
    await expect(
      OrderModel.create({ ...order, receiptNo: 'MOKA-0001' }),
    ).rejects.toThrow(/E11000|duplicate key/i);
  });
});

describe('indexes', () => {
  const indexNames = async (collection: string): Promise<string[]> => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('not connected');
    const indexes = await db.collection(collection).indexes();
    return indexes.map((index) => index.name ?? '');
  };

  it('indexes orders by createdAt descending for report range scans', async () => {
    expect(await indexNames('orders')).toContain('createdAt_-1');
  });

  it('indexes orders by cashierId', async () => {
    expect(await indexNames('orders')).toContain('cashierId_1');
  });

  it('indexes stock_movements newest-first', async () => {
    expect(await indexNames('stock_movements')).toContain('createdAt_-1');
  });

  it('indexes shifts by user and status together', async () => {
    expect(await indexNames('shifts')).toContain('userId_1_status_1');
  });

  it('does not index order lines by product, since lines are never joined', async () => {
    expect(await indexNames('orders')).not.toContain('lines.productId_1');
  });
});

describe('recipe products', () => {
  it('stores recipe lines without sub-document ids', async () => {
    const ingredient = await IngredientModel.create({
      name: 'Espresso',
      unit: 'gram',
      stock: 5000,
      minStock: 1000,
      costPerUnit: 30,
    });
    const product = await ProductModel.create({
      name: 'Iced Latte',
      categoryId: new mongoose.Types.ObjectId(),
      price: 24000,
      image: '/menu/coffee/iced_latte.svg',
      stockMode: 'recipe',
      recipe: [{ ingredientId: ingredient._id, qty: 18 }],
      isActive: true,
    });

    expect(product.recipe).toHaveLength(1);
    expect((product.recipe[0] as { _id?: unknown })._id).toBeUndefined();
    // A recipe product carries no stock of its own.
    expect(product.stock).toBeUndefined();
  });

  it('rejects a recipe quantity of zero', async () => {
    await expect(
      ProductModel.create({
        name: 'Iced Latte',
        categoryId: new mongoose.Types.ObjectId(),
        price: 24000,
        image: '/menu/coffee/iced_latte.svg',
        stockMode: 'recipe',
        recipe: [{ ingredientId: new mongoose.Types.ObjectId(), qty: 0 }],
      }),
    ).rejects.toThrow();
  });
});
