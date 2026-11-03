import { Types, type ClientSession } from 'mongoose';
import { env } from '../../config/env.js';
import { withTransaction } from '../../db/transaction.js';
import { dayRange } from '../../lib/dates.js';
import { ApiError } from '../../lib/errors.js';
import { calculateTax, normalisePhone, roundIDR } from '../../lib/money.js';
import { escapeRegExp } from '../../lib/schemas.js';
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
  isActive: boolean;
};

type SaleLine = {
  productId: Types.ObjectId;
  name: string;
  price: number;
  qty: number;
  stockMode: 'recipe' | 'direct';
};

/** The parts of a product document the void actually reads. */
type VoidableProduct = {
  _id: Types.ObjectId;
  stockMode: 'recipe' | 'direct';
  recipe: { ingredientId: Types.ObjectId; qty: number }[];
};

export type OrderResult = {
  order: unknown;
  movements: unknown[];
  /** True when this was an `Idempotency-Key` replay rather than a new sale. */
  replayed: boolean;
};

export type VoidResult = {
  order: unknown;
  movements: unknown[];
  /**
   * Stock that could not be restored and why. A void still succeeds when some
   * or all of its items cannot be reversed — the receipt is reversed whether or
   * not the shelf can be — but the admin who voided is told exactly what fell
   * outside the transaction's reach.
   */
  warnings: string[];
};

export type OrderPage = {
  data: unknown[];
  /** Total matching rows before pagination, for the caller's page arithmetic. */
  total: number;
  limit: number;
  offset: number;
};

export async function listOrders(query: OrderQuery): Promise<OrderPage> {
  const filter: Record<string, unknown> = {};

  if (query.cashierId) filter.cashierId = new Types.ObjectId(query.cashierId);
  if (query.status) filter.status = query.status;
  if (query.method) filter.paymentMethod = query.method;

  const range = dayRange(query.from, query.to, env().STORE_TIMEZONE);
  if (range) filter.createdAt = range;

  /**
   * Search over the fields a caller actually names on the phone: the receipt
   * number, the customer name, or the phone of theirs on the receipt.
   * Case-insensitive substring, escaped first so "MOKA-B4T" cannot turn its
   * brackets into a character class.
   */
  if (query.q) {
    const rx = new RegExp(escapeRegExp(query.q), 'i');
    const alternatives: Record<string, unknown>[] = [
      { receiptNo: rx },
      { 'customer.name': rx },
    ];
    // A phone search needs digits; matching a text-only needle against phone
    // numbers would create a filter that can never hit anything.
    if (/\d/.test(query.q)) alternatives.push({ 'customer.phone': rx });
    filter.$or = alternatives;
  }

  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  /**
   * Sort the filtered set first, then page it. `_id` is the tiebreak so two
   * receipts written in the same millisecond keep a stable order across pages;
   * without it the database is free to return them differently on each skip.
   */
  const direction = query.direction === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = {
    [query.sort]: direction,
    _id: direction,
  };

  const [data, total] = await Promise.all([
    OrderModel.find(filter).sort(sort).skip(offset).limit(limit),
    OrderModel.countDocuments(filter),
  ]);

  return { data, total, limit, offset };
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
    const replay = await findReplay(
      idempotencyKey,
      cashier,
      await openShiftId(cashier),
    );
    if (replay) return replay;
  }

  try {
    const { order, movements } = await runSale(input, cashier, idempotencyKey);
    return { order, movements, replayed: false };
  } catch (error) {
    // Two retries raced. The loser can fail on the unique key, but it can also
    // fail earlier: with one unit left, its coverage check or conditional stock
    // decrement sees the winner's committed sale first and raises
    // `insufficient-stock`. Either way the winner's key is already committed, so
    // look for the receipt before surfacing an error that would tell the cashier
    // a sale that succeeded did not happen.
    if (idempotencyKey) {
      const replay = await findReplay(
        idempotencyKey,
        cashier,
        await openShiftId(cashier),
      );
      if (replay) return replay;
    }
    throw error;
  }
}

/**
 * Reverses a sale: receipt flipped to `voided`, stock returned, ledger written.
 *
 * One transaction, like the sale it mirrors. The order is claimed *first* — a
 * conditional update on `status: 'paid'` — so two admins voiding the same
 * receipt race on that write, not on the stock: exactly one restores, the other
 * restarts and finds the receipt already voided.
 *
 * Stock is restored from the *current* catalogue, not the moment of sale. The
 * order trustfully denormalises what was charged, but a recipe or mode is
 * changed by later edits, and the shelf that exists today is the one that has
 * to be corrected today. Where the catalogue can no longer express what the
 * sale consumed, the line is skipped with a warning instead of guessed at.
 */
export async function voidOrder(
  id: string,
  reason: string,
  admin: SessionUser,
): Promise<VoidResult> {
  return withTransaction(async (session) => {
    const order = await OrderModel.findById(id).session(session);
    if (!order) {
      throw ApiError.notFound('That receipt no longer exists.');
    }
    if (order.status === 'voided') {
      throw ApiError.conflict(
        'order-already-voided',
        `${order.receiptNo} has already been voided.`,
      );
    }

    /**
     * A closed shift is a reconciled cash drawer: its counted cash, expected
     * cash, and variance have been signed off. Reversing a sale from that shift
     * would silently restate a document the manager already took away, so the
     * correction has to be a new movement against today's drawer instead.
     *
     * Orders from before shifts were mandatory (and some seeded history) carry
     * no `shiftId`; those remain voidable because there is no closed drawer to
     * contradict.
     */
    if (order.shiftId) {
      const shift = await ShiftModel.findById(order.shiftId)
        .select('status')
        .session(session);
      if (shift?.status === 'closed') {
        throw ApiError.conflict(
          'shift-closed',
          `${order.receiptNo} belongs to a closed shift and cannot be voided.`,
        );
      }
    }

    // --- 1. Claim the receipt. Everything below rides on having won this.
    const claimed = await OrderModel.findOneAndUpdate(
      { _id: order._id, status: 'paid' },
      {
        $set: {
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: admin.id,
          voidedByName: admin.name,
          voidReason: reason,
        },
      },
      { returnDocument: 'after', session },
    );
    if (!claimed) {
      // Lost a concurrent claim after the read above.
      throw ApiError.conflict(
        'order-already-voided',
        `${order.receiptNo} has already been voided.`,
      );
    }

    const movements: unknown[] = [];
    const warnings: string[] = [];
    // `Voided MOKA-1234` + reason must fit the ledger note's 240-char column.
    const note = `Voided ${order.receiptNo} — ${reason}`.slice(0, 240);

    // --- 2. Work out what *today's* catalogue says each line was made of.
    const productIds = [...new Set(order.lines.map((line) => line.productId))];
    const products = (await ProductModel.find({
      _id: { $in: productIds },
    })
      .select('stockMode recipe')
      .session(session)) as unknown as VoidableProduct[];
    const productNow = new Map(products.map((p) => [String(p._id), p]));

    const ingredientNeed = new Map<string, number>();
    const directRestore: {
      productId: Types.ObjectId;
      label: string;
      qty: number;
    }[] = [];

    for (const line of order.lines) {
      const product = productNow.get(String(line.productId));

      if (!product) {
        warnings.push(
          `${line.name} was deleted since this sale, so its stock could not be restored.`,
        );
        continue;
      }
      if (product.stockMode !== line.stockMode) {
        warnings.push(
          `${line.name} changed stockMode since this sale, so its stock could not be restored.`,
        );
        continue;
      }

      if (line.stockMode === 'direct') {
        directRestore.push({
          productId: product._id,
          label: line.name,
          qty: line.qty,
        });
        continue;
      }

      // Recipe restore uses the recipe as it stands now.
      for (const item of product.recipe) {
        const key = String(item.ingredientId);
        ingredientNeed.set(
          key,
          (ingredientNeed.get(key) ?? 0) + item.qty * line.qty,
        );
      }
    }

    // --- 3. Put direct stock back. Positive quantities cannot go negative, so
    //        no conditional filter is needed.
    for (const restore of directRestore) {
      await ProductModel.updateOne(
        { _id: restore.productId },
        { $inc: { stock: restore.qty } },
        { session },
      );
      movements.push(
        await recordVoid({
          productId: restore.productId,
          label: restore.label,
          qty: restore.qty,
          unit: 'pcs',
          note,
          admin,
          session,
        }),
      );
    }

    // --- 4. Put ingredients back, aggregated per ingredient like consumeStock.
    const ingredientDocs = (await IngredientModel.find({
      _id: { $in: [...ingredientNeed.keys()] },
    })
      .select('name unit')
      .session(session)) as unknown as {
      _id: Types.ObjectId;
      name: string;
      unit: 'gram' | 'ml' | 'pcs';
    }[];
    const ingredientById = new Map(
      ingredientDocs.map((i) => [String(i._id), i]),
    );

    for (const [id, needed] of ingredientNeed) {
      const ingredient = ingredientById.get(id);
      if (!ingredient) {
        warnings.push(
          'An ingredient in this recipe no longer exists, so its stock could not be restored.',
        );
        continue;
      }

      await IngredientModel.updateOne(
        { _id: ingredient._id },
        { $inc: { stock: needed } },
        { session },
      );
      movements.push(
        await recordVoid({
          ingredientId: ingredient._id,
          label: ingredient.name,
          qty: needed,
          unit: ingredient.unit,
          note,
          admin,
          session,
        }),
      );
    }

    return { order: claimed, movements, warnings };
  });
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
    const shift = await ShiftModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(cashier.id),
        status: 'open',
      },
      // Touch the shift inside this transaction. A concurrent close has to
      // serialise behind this write, so it cannot read the shift's sales and
      // commit a close while this receipt is still being written.
      { $inc: { __v: 1 } },
      { returnDocument: 'after', session },
    );
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

    // Hiding a product removes it from the POS grid, but a tab left open from
    // before the change can still POST its id. The menu, not the stale client,
    // decides what is sellable.
    const inactive = products.find((product) => !product.isActive);
    if (inactive) {
      throw ApiError.validation(
        `${inactive.name} is no longer available. Remove it from the cart and try again.`,
        { lines: `${inactive.name} has been hidden from the menu.` },
      );
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

    if (input.paidAmount < total) {
      throw ApiError.validation(
        `Payment is Rp ${roundIDR(total - input.paidAmount)} short of the total.`,
        { paidAmount: `Collect at least Rp ${total}.` },
      );
    }

    // --- 3. Coverage across the whole cart, before anything moves.
    await assertCoverage(lines, byId, session);

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
            shiftId: shift._id,
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
  session: ClientSession,
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
      .session(session)
      .lean(),
    ProductModel.find({ _id: { $in: [...directNeed.keys()] } })
      .select('name stock')
      .session(session)
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
 * The ledger row a void writes: a positive `void` movement mirroring the
 * negative `sale` the receipt consumed. Only `voidOrder` writes this type —
 * manual adjustment refuses it so the sale/void pairs stay auditable.
 */
async function recordVoid(input: {
  productId?: Types.ObjectId | null;
  ingredientId?: Types.ObjectId | null;
  label: string;
  qty: number;
  unit: 'gram' | 'ml' | 'pcs';
  note: string;
  admin: SessionUser;
  session: ClientSession;
}): Promise<unknown> {
  const [movement] = await StockMovementModel.create(
    [
      {
        type: 'void',
        ingredientId: input.ingredientId ?? null,
        productId: input.productId ?? null,
        label: input.label,
        qty: input.qty,
        unit: input.unit,
        note: input.note,
        byUserId: input.admin.id,
        byUserName: input.admin.name,
        createdAt: new Date(),
      },
    ],
    { session: input.session },
  );
  return movement;
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
    email: raw.email?.trim() || null,
  };
}

async function openShiftId(
  cashier: SessionUser,
): Promise<Types.ObjectId | null> {
  const shift = await ShiftModel.findOne({
    userId: new Types.ObjectId(cashier.id),
    status: 'open',
  })
    .select('_id')
    .lean<{ _id: Types.ObjectId } | null>();
  return shift?._id ?? null;
}

async function findReplay(
  idempotencyKey: string,
  cashier: SessionUser,
  currentShiftId: Types.ObjectId | null,
): Promise<OrderResult | null> {
  const record = await IdempotencyKeyModel.findById(idempotencyKey);
  if (!record) return null;

  const foreignKey = () =>
    ApiError.conflict(
      'idempotency-key-foreign',
      'This payment was already submitted by another cashier or shift. Start a new sale instead of retrying this one.',
    );

  // A key is one cashier's retry token, not a shared receipt id. Whoever holds
  // another user's key must not be handed that user's receipt back — totals,
  // phone numbers and everything else on it. The caller is told to mint a new
  // key instead, which keeps this refusal silent about the key's existence
  // beyond the fact that it is not theirs.
  if (String(record.userId) !== cashier.id) {
    throw foreignKey();
  }

  // The same teller on a later shift is a different sale context. A stale key
  // must not resurrect yesterday's receipt on today's drawer.
  if (
    record.shiftId &&
    currentShiftId &&
    String(record.shiftId) !== String(currentShiftId)
  ) {
    throw foreignKey();
  }

  const order = await OrderModel.findById(record.orderId);
  if (!order) return null;

  // Legacy records predate `shiftId`; the shift stamped on the order is the
  // next-best binding.
  if (
    !record.shiftId &&
    currentShiftId &&
    order.shiftId &&
    String(order.shiftId) !== String(currentShiftId)
  ) {
    throw foreignKey();
  }

  // The ledger is re-readable on its own endpoint; a replay does not restate it.
  return { order, movements: [], replayed: true };
}
