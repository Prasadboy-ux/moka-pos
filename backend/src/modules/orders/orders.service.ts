import { Types, type ClientSession } from 'mongoose';
import { env } from '../../config/env.js';
import { withTransaction } from '../../db/transaction.js';
import { dayRange } from '../../lib/dates.js';
import { ApiError } from '../../lib/errors.js';
import { calculateTax, normalisePhone, roundIDR } from '../../lib/money.js';
import { CounterModel } from '../../models/counter.model.js';
import { IdempotencyKeyModel } from '../../models/idempotency-key.model.js';
import { IngredientModel } from '../../models/ingredient.model.js';
import { OrderModel } from '../../models/order.model.js';
import { ProductModel } from '../../models/product.model.js';
import { ShiftModel } from '../../models/shift.model.js';
import { StockMovementModel } from '../../models/stock-movement.model.js';
import { type SessionUser } from '../../models/user.model.js';
import type { CreateOrderInput, OrderQuery } from './orders.schemas.js';

/** The parts of a product document the sale actually reads. */
type SellableProduct = {
  _id: Types.ObjectId;
  name: string;
  price: number;
  stockMode: 'recipe' | 'direct';
  stock?: number;
  recipe: { ingredientId: Types.ObjectId; qty: number }[];
};

type SaleLine = {
  productId: Types.ObjectId;
  name: string;
  price: number;
  qty: number;
  stockMode: 'recipe' | 'direct';
};

export type OrderResult = {
  order: unknown;
  movements: unknown[];
  /** True when this was an `Idempotency-Key` replay rather than a new sale. */
  replayed: boolean;
};

export async function listOrders(query: OrderQuery) {
  const filter: Record<string, unknown> = {};

  if (query.cashierId) filter.cashierId = new Types.ObjectId(query.cashierId);

  const range = dayRange(query.from, query.to, env().STORE_TIMEZONE);
  if (range) filter.createdAt = range;

  return OrderModel.find(filter).sort({ createdAt: -1, _id: -1 });
}

export async function getOrder(id: string) {
  const order = await OrderModel.findById(id);
  if (!order) throw ApiError.notFound('That receipt no longer exists.');
  return order;
}

export async function recentOrders(limit: number) {
  return OrderModel.find().sort({ createdAt: -1, _id: -1 }).limit(limit);
}

export async function createOrder(
  input: CreateOrderInput,
  cashier: SessionUser,
  idempotencyKey: string | undefined,
): Promise<OrderResult> {
  // Fast path for a retry of a request that already succeeded. Outside the
  // transaction so a plain replay costs one indexed read and no transaction.
  if (idempotencyKey) {
    const replay = await findReplay(idempotencyKey);
    if (replay) return replay;
  }

  try {
    const { order, movements } = await runSale(input, cashier, idempotencyKey);
    return { order, movements, replayed: false };
  } catch (error) {
    // Two retries raced. One won and inserted the key; the loser hit the unique
    // index. Return the winner's receipt instead of charging the customer twice.
    if (idempotencyKey && isDuplicateKey(error)) {
      const replay = await findReplay(idempotencyKey);
      if (replay) return replay;
    }
    throw error;
  }
}

/**
 * The sale, as one transaction.
 *
 * Every step below either completes or the whole thing rolls back. A partial
 * sale is the failure mode that must never occur: a receipt existing for stock
 * that was never sold, or stock consumed by a receipt that does not exist. The
 * mock gets the same guarantee from its snapshot-and-restore `mutate`, which is
 * why its stock numbers can be trusted.
 */
async function runSale(
  input: CreateOrderInput,
  cashier: SessionUser,
  idempotencyKey: string | undefined,
) {
  const taxRate = env().TAX_RATE_DEFAULT;

  return withTransaction(async (session) => {
    // --- 0. An open shift gates selling, for every role. An admin's cash sale
    //        misses the drawer count just as badly as a cashier's. Checked inside
    //        the transaction so a close committing mid-sale is seen, and the
    //        shift's id is stamped on the receipt as history.
    const shift = await ShiftModel.findOne({
      userId: new Types.ObjectId(cashier.id),
      status: 'open',
    }).session(session);
    if (!shift) {
      throw ApiError.conflict(
        'no-open-shift',
        'Open a shift before taking payments.',
      );
    }

    // --- 1. Re-read every product. Prices come from storage, never the client.
    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const products = (await ProductModel.find({
      _id: { $in: productIds },
    }).session(session)) as unknown as SellableProduct[];
    const byId = new Map(
      products.map((product) => [String(product._id), product]),
    );

    for (const line of input.lines) {
      if (!byId.has(line.productId)) {
        throw ApiError.notFound(`Product ${line.productId} no longer exists.`);
      }
    }

    // --- 2. Denormalised lines: name, price and mode as sold. A receipt printed
    //        in two years still shows what was charged, not today's price.
    const lines: SaleLine[] = input.lines.map((line) => {
      const product = byId.get(line.productId)!;
      return {
        productId: product._id,
        name: product.name,
        price: product.price,
        qty: line.qty,
        stockMode: product.stockMode,
      };
    });

    const subtotal = roundIDR(
      lines.reduce((sum, line) => sum + line.price * line.qty, 0),
    );
    const taxAmount = calculateTax(subtotal, taxRate);
    const total = roundIDR(subtotal + taxAmount);

    // --- 3. Coverage across the whole cart, before anything moves.
    await assertCoverage(lines, byId);

    // --- 4. Receipt number, allocated atomically so two tills cannot collide.
    const counter = await CounterModel.findOneAndUpdate(
      { _id: 'receipt' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true, session },
    );
    const receiptNo = `MOKA-${String(counter.seq).padStart(4, '0')}`;

    // --- 5. The receipt.
    const [order] = await OrderModel.create(
      [
        {
          receiptNo,
          lines,
          subtotal,
          taxRate,
          taxAmount,
          total,
          paymentMethod: input.paymentMethod,
          paidAmount: input.paidAmount,
          changeAmount: input.paidAmount - total,
          cashierId: cashier.id,
          cashierName: cashier.name,
          shiftId: shift._id,
          customer: normaliseCustomer(input),
          createdAt: new Date(),
        },
      ],
      { session },
    );

    // --- 6. Consume stock and record why.
    const movements = await consumeStock(
      lines,
      byId,
      cashier,
      receiptNo,
      session,
    );

    if (idempotencyKey) {
      await IdempotencyKeyModel.create(
        [
          {
            _id: idempotencyKey,
            userId: cashier.id,
            orderId: order!._id,
            createdAt: new Date(),
          },
        ],
        { session },
      );
    }

    return { order, movements };
  });
}

/**
 * Works out what the whole cart needs, then checks it in one pass.
 *
 * Aggregating first is what makes the refusal useful: a cart of two lattes
 * needs 360 ml of milk, and the operator is told that once, by name, rather than
 * the sale dying on the first line it happens to try to decrement.
 */
async function assertCoverage(
  lines: SaleLine[],
  byId: Map<string, SellableProduct>,
): Promise<void> {
  /** id -> total quantity needed across every line that touches it. */
  const ingredientNeed = new Map<string, number>();
  const directNeed = new Map<string, number>();

  for (const line of lines) {
    const product = byId.get(String(line.productId))!;

    if (product.stockMode === 'direct') {
      const id = String(product._id);
      directNeed.set(id, (directNeed.get(id) ?? 0) + line.qty);
      continue;
    }

    for (const item of product.recipe) {
      const id = String(item.ingredientId);
      ingredientNeed.set(
        id,
        (ingredientNeed.get(id) ?? 0) + item.qty * line.qty,
      );
    }
  }

  const [ingredients, directProducts] = await Promise.all([
    IngredientModel.find({ _id: { $in: [...ingredientNeed.keys()] } })
      .select('name unit stock')
      .lean(),
    ProductModel.find({ _id: { $in: [...directNeed.keys()] } })
      .select('name stock')
      .lean(),
  ]);

  const ingredientById = new Map(ingredients.map((i) => [String(i._id), i]));

  for (const [id, needed] of ingredientNeed) {
    const ingredient = ingredientById.get(id);
    if (!ingredient) {
      throw ApiError.notFound(
        'A recipe for this order references an ingredient that no longer exists.',
      );
    }
    if (ingredient.stock < needed) {
      throw ApiError.insufficientStock(
        `${ingredient.name} is short for this order — needs ${needed} ${ingredient.unit}, only ${ingredient.stock} on hand.`,
      );
    }
  }

  const productById = new Map(directProducts.map((p) => [String(p._id), p]));

  for (const [id, needed] of directNeed) {
    const product = productById.get(id);
    if (!product)
      throw ApiError.notFound('A product in this order no longer exists.');

    const onHand = product.stock ?? 0;
    if (onHand < needed) {
      throw ApiError.insufficientStock(
        `${product.name} is short for this order — needs ${needed} pcs, only ${onHand} on hand.`,
      );
    }
  }
}

/**
 * Applies the decrements and writes the matching ledger rows.
 *
 * Each decrement is *conditional* — `$inc` filtered on an expression requiring
 * `stock >= qty` — so the database itself refuses to go negative. The coverage
 * check above produces the readable message; this is the guarantee that it
 * cannot be talked past by a concurrent till.
 */
async function consumeStock(
  lines: SaleLine[],
  byId: Map<string, SellableProduct>,
  cashier: SessionUser,
  receiptNo: string,
  session: ClientSession,
): Promise<unknown[]> {
  const note = `Sold on ${receiptNo}`;
  const movements: unknown[] = [];

  for (const line of lines) {
    const product = byId.get(String(line.productId))!;

    if (product.stockMode === 'direct') {
      const result = await ProductModel.updateOne(
        { _id: product._id, $expr: { $gte: ['$stock', line.qty] } },
        { $inc: { stock: -line.qty } },
        { session },
      );
      if (result.modifiedCount === 0) {
        throw short(product.name, product.stock ?? 0, 'pcs');
      }

      const [movement] = await StockMovementModel.create(
        [
          {
            type: 'sale',
            ingredientId: null,
            productId: product._id,
            label: product.name,
            qty: -line.qty,
            unit: 'pcs',
            note,
            byUserId: cashier.id,
            byUserName: cashier.name,
            createdAt: new Date(),
          },
        ],
        { session },
      );
      movements.push(movement);
      continue;
    }

    for (const item of product.recipe) {
      const needed = item.qty * line.qty;

      const ingredient = await IngredientModel.findById(item.ingredientId)
        .select('name unit stock')
        .session(session);
      if (!ingredient) {
        throw ApiError.notFound(
          `Recipe for ${product.name} references a missing ingredient.`,
        );
      }

      const result = await IngredientModel.updateOne(
        { _id: ingredient._id, $expr: { $gte: ['$stock', needed] } },
        { $inc: { stock: -needed } },
        { session },
      );
      if (result.modifiedCount === 0) {
        throw short(ingredient.name, ingredient.stock, ingredient.unit);
      }

      const [movement] = await StockMovementModel.create(
        [
          {
            type: 'sale',
            ingredientId: ingredient._id,
            productId: null,
            label: ingredient.name,
            qty: -needed,
            unit: ingredient.unit,
            note,
            byUserId: cashier.id,
            byUserName: cashier.name,
            createdAt: new Date(),
          },
        ],
        { session },
      );
      movements.push(movement);
    }
  }

  return movements;
}

function short(name: string, onHand: number, unit: string): ApiError {
  return ApiError.insufficientStock(
    `${name} is short — only ${onHand} ${unit} on hand.`,
  );
}

/**
 * Normalises whatever the cashier typed into something a receipt link can be
 * built from.
 *
 * A `+62 812-` that was never normalised produces a `wa.me` link that opens
 * nobody's chat, and once the order is stored nothing downstream can tell
 * whether the number was worth keeping. Returns `null` when there is no usable
 * number, so an order never carries a customer who cannot be contacted.
 *
 * A name with no number still identifies someone, but a number with no name
 * cannot be printed on a receipt, so the number is the part that has to be there.
 */
function normaliseCustomer(input: CreateOrderInput) {
  const raw = input.customer;
  if (!raw) return null;

  const phone = normalisePhone(raw.phone);
  if (!phone) return null;

  return {
    name: raw.name.trim() || 'Customer',
    phone,
    email: raw.email.trim() || null,
  };
}

async function findReplay(idempotencyKey: string): Promise<OrderResult | null> {
  const record = await IdempotencyKeyModel.findById(idempotencyKey);
  if (!record) return null;

  const order = await OrderModel.findById(record.orderId);
  if (!order) return null;

  // The ledger is re-readable on its own endpoint; a replay does not restate it.
  return { order, movements: [], replayed: true };
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof Error && (error as { code?: unknown }).code === 11000;
}
