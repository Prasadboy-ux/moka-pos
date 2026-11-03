import { Types, type ClientSession } from 'mongoose';
import { withTransaction } from '../../db/transaction.js';
import { ApiError } from '../../lib/errors.js';
import { roundIDR } from '../../lib/money.js';
import { IngredientModel } from '../../models/ingredient.model.js';
import { ProductModel } from '../../models/product.model.js';
import { type SessionUser } from '../../models/user.model.js';
import { StockMovementModel } from '../../models/stock-movement.model.js';
import type {
  AdjustInput,
  LevelQuery,
  MovementFilter,
} from './stock.schemas.js';

/**
 * Stock reads and manual adjustments.
 *
 * The ledger is an audit trail, never the source of truth. `ingredient.stock`
 * and direct-mode `product.stock` hold the current level; this module is the
 * only place that writes them. One writer means the ledger cannot quietly fall
 * out of step with the numbers.
 */

/** One read of the audit trail, shaped like the order ledger's page. */
export type MovementPage = {
  data: unknown[];
  /** Total matching rows before pagination, for the caller's page arithmetic. */
  total: number;
  limit: number;
  offset: number;
};

export async function listMovements(
  filter: MovementFilter,
): Promise<MovementPage> {
  const query: Record<string, unknown> = {};

  if (filter.type) query.type = filter.type;
  if (filter.ingredientId)
    query.ingredientId = new Types.ObjectId(filter.ingredientId);
  if (filter.productId) query.productId = new Types.ObjectId(filter.productId);

  const limit = filter.limit ?? 200;
  const offset = filter.offset ?? 0;

  // Newest first, which is the order every screen reads them in.
  const [data, total] = await Promise.all([
    StockMovementModel.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit),
    StockMovementModel.countDocuments(query),
  ]);

  return { data, total, limit, offset };
}

/**
 * Current stock for one item.
 *
 * Returns `null` — not an error — for a recipe product, which genuinely has no
 * stock of its own. Its availability is derived from its ingredients, and
 * answering `0` here would read as "out of stock" and block a drink that is
 * perfectly sellable.
 */
export async function levelOf(query: LevelQuery) {
  if (query.target === 'ingredient') {
    const ingredient = await IngredientModel.findById(query.targetId).select(
      'stock',
    );
    if (!ingredient)
      throw ApiError.notFound('That ingredient no longer exists.');
    return ingredient.stock;
  }

  const product = await ProductModel.findById(query.targetId).select(
    'stock stockMode',
  );
  if (!product) throw ApiError.notFound('That product no longer exists.');
  if (product.stockMode !== 'direct') return null;

  return product.stock ?? 0;
}

/**
 * Inventory value.
 *
 * The two figures are reported separately and only summed for a rough estimate,
 * and the UI labels the total "treat as an order of magnitude". That labelling
 * has to survive here, because `retailValue` is packaging valued at *selling*
 * price — there is no cost field on a direct product — so the sum is not a
 * meaningful balance sheet figure.
 */
export async function stockValue() {
  const [ingredients, directProducts] = await Promise.all([
    IngredientModel.find({}, { stock: 1, costPerUnit: 1 }),
    ProductModel.find({ stockMode: 'direct' }, { stock: 1, price: 1 }),
  ]);

  const ingredientsValue = ingredients.reduce(
    (sum, ingredient) => sum + ingredient.stock * ingredient.costPerUnit,
    0,
  );

  const retailValue = directProducts.reduce(
    (sum, product) => sum + (product.stock ?? 0) * product.price,
    0,
  );

  return {
    ingredientsValue: roundIDR(ingredientsValue),
    retailValue: roundIDR(retailValue),
    total: roundIDR(ingredientsValue + retailValue),
  };
}

/**
 * Writes the opening level for a newly created direct product.
 *
 * Product creation is the one stock change that does not start from
 * `POST /api/stock/adjust`, because the product does not exist to adjust yet.
 * It still routes through this module so the opening count is a `purchase`
 * movement in the ledger rather than a number that appears from nowhere.
 *
 * Recipe products have no stock of their own, so the level write is skipped and
 * the caller keeps their ingredients as the only stock account.
 */
type DirectProductDocument = {
  _id: unknown;
  name: string;
  stockMode: 'recipe' | 'direct';
  stock?: number | null;
  save(options: { session: ClientSession }): Promise<unknown>;
};

export async function recordOpeningStock(
  product: DirectProductDocument,
  qty: number,
  actor: SessionUser,
  session: ClientSession,
): Promise<void> {
  if (product.stockMode !== 'direct') return;

  product.stock = qty;
  await product.save({ session });

  if (qty === 0) return;

  const movement = new StockMovementModel({
    type: 'purchase',
    ingredientId: null,
    productId: product._id,
    label: product.name,
    qty,
    unit: 'pcs',
    note: 'Opening stock',
    byUserId: actor.id,
    byUserName: actor.name,
  });
  await movement.save({ session });
}

/**
 * A manual stock change: a delivery in, waste out, or a correction.
 *
 * Runs in a transaction because it writes two documents. The level move and the
 * ledger row that explain it are one fact, and a crash between them would
 * leave stock that no movement accounts for — which is exactly the drift the
 * ledger exists to prevent.
 *
 * The level move itself is a *conditional `$inc`*, not a read-then-save. A sale
 * decrementing the same field with its own `$inc` between this request's read
 * and write would be silently lost when the adjust writes back the stale read
 * plus the delta. Filtering on the level instead makes "enough on hand" part
 * of the one atomic update, and `$inc` composes with concurrent sales instead
 * of racing them.
 *
 * `actor` comes from the session. Anything named in the request body is ignored.
 */
export async function adjustStock(input: AdjustInput, actor: SessionUser) {
  return withTransaction(async (session) => {
    if (input.target === 'ingredient') {
      const updated = await IngredientModel.findOneAndUpdate(
        {
          _id: input.targetId,
          // A negative adjustment may only drive the level to exactly zero.
          ...(input.qty < 0 ? { stock: { $gte: -input.qty } } : {}),
        },
        { $inc: { stock: input.qty } },
        { session, returnDocument: 'after' },
      );

      if (!updated) {
        // Distinguish "gone" from "not enough": 404 and 422 read differently,
        // and only a follow-up read (visible inside this transaction) can tell
        // which guard the update failed.
        const existing = await IngredientModel.findById(input.targetId).session(
          session,
        );
        if (!existing)
          throw ApiError.notFound('That ingredient no longer exists.');
        throw ApiError.validation(
          `Cannot remove ${Math.abs(input.qty)} ${existing.unit}; only ${existing.stock} on hand.`,
          { qty: `Only ${existing.stock} ${existing.unit} on hand.` },
        );
      }

      const movement = new StockMovementModel({
        type: input.type,
        ingredientId: updated._id,
        productId: null,
        // Denormalised so the ledger still reads correctly after a rename.
        label: updated.name,
        qty: input.qty,
        unit: updated.unit,
        note: input.note,
        byUserId: actor.id,
        byUserName: actor.name,
      });
      await movement.save({ session });

      return movement;
    }

    const product = await ProductModel.findById(input.targetId).session(
      session,
    );
    if (!product) throw ApiError.notFound('That product no longer exists.');

    // A recipe product has no stock to adjust — its ingredients do.
    if (product.stockMode !== 'direct') {
      throw ApiError.validation(
        `${product.name} is made from a recipe, so its stock moves through its ingredients.`,
        { targetId: 'Adjust one of its ingredients instead.' },
      );
    }

    /**
     * Direct stock is counted in whole pcs. The schema accepts decimals so the
     * same field can carry gram or millilitre corrections; only the target
     * lookup can tell which rule applies.
     */
    if (!Number.isInteger(input.qty)) {
      throw ApiError.validation(`${product.name} is counted in whole pcs.`, {
        qty: 'Use a whole number of pcs.',
      });
    }

    // `$inc` refuses to operate on a null level; a direct product freshly
    // switched over from a recipe carries one. Inside this transaction the
    // initialisation is read-your-writes, so the guarded update below
    // evaluates against 0.
    if (product.stock == null) {
      await ProductModel.updateOne(
        { _id: product._id },
        { $set: { stock: 0 } },
        { session },
      );
    }

    const updatedProduct = await ProductModel.findOneAndUpdate(
      {
        _id: product._id,
        // The mode could not change inside this transaction (the catalogue
        // update that switches it is itself transactional), but stating it
        // keeps the update honest in isolation.
        stockMode: 'direct',
        ...(input.qty < 0 ? { stock: { $gte: -input.qty } } : {}),
      },
      { $inc: { stock: input.qty } },
      { session, returnDocument: 'after' },
    );

    if (!updatedProduct) {
      const onHand = product.stock ?? 0;
      const gone = await ProductModel.findById(input.targetId).session(session);
      if (!gone) throw ApiError.notFound('That product no longer exists.');
      throw ApiError.validation(
        `Cannot remove ${Math.abs(input.qty)} pcs; only ${onHand} on hand.`,
        { qty: `Only ${onHand} pcs on hand.` },
      );
    }

    const movement = new StockMovementModel({
      type: input.type,
      ingredientId: null,
      productId: product._id,
      label: product.name,
      qty: input.qty,
      unit: 'pcs',
      note: input.note,
      byUserId: actor.id,
      byUserName: actor.name,
    });
    await movement.save({ session });

    return movement;
  });
}
