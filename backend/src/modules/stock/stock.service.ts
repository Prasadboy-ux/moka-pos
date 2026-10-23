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

export async function listMovements(filter: MovementFilter) {
  const query: Record<string, unknown> = {};

  if (filter.type) query.type = filter.type;
  if (filter.ingredientId)
    query.ingredientId = new Types.ObjectId(filter.ingredientId);
  if (filter.productId) query.productId = new Types.ObjectId(filter.productId);

  // Newest first, which is the order every screen reads them in.
  return StockMovementModel.find(query).sort({ createdAt: -1, _id: -1 });
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

  return product.stock ?? null;
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
 * ledger row that explains it are one fact, and a crash between them would
 * leave stock that no movement accounts for — which is exactly the drift the
 * ledger exists to prevent.
 *
 * `actor` comes from the session. Anything named in the request body is ignored.
 */
export async function adjustStock(input: AdjustInput, actor: SessionUser) {
  return withTransaction(async (session) => {
    if (input.target === 'ingredient') {
      const ingredient = await IngredientModel.findById(input.targetId).session(
        session,
      );
      if (!ingredient)
        throw ApiError.notFound('That ingredient no longer exists.');

      const onHand = ingredient.stock;
      const next = onHand + input.qty;

      if (next < 0) {
        throw ApiError.validation(
          `Cannot remove ${Math.abs(input.qty)} ${ingredient.unit}; only ${onHand} on hand.`,
          { qty: `Only ${onHand} ${ingredient.unit} on hand.` },
        );
      }

      ingredient.stock = next;
      await ingredient.save({ session });

      const movement = new StockMovementModel({
        type: input.type,
        ingredientId: ingredient._id,
        productId: null,
        // Denormalised so the ledger still reads correctly after a rename.
        label: ingredient.name,
        qty: input.qty,
        unit: ingredient.unit,
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

    const onHand = product.stock ?? 0;
    const next = onHand + input.qty;

    if (next < 0) {
      throw ApiError.validation(
        `Cannot remove ${Math.abs(input.qty)} pcs; only ${onHand} on hand.`,
        { qty: `Only ${onHand} pcs on hand.` },
      );
    }

    product.stock = next;
    await product.save({ session });

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
