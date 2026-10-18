import { Router, type Request, type Response } from 'express';
import { idParam } from '../../lib/schemas.js';
import { parsed, validate } from '../../lib/validate.js';
import { requireSession, sessionUser } from '../../middleware/session.js';
import {
  createOrderInput,
  orderQuery,
  recentQuery,
  type CreateOrderInput,
  type OrderQuery,
} from './orders.schemas.js';
import {
  createOrder,
  getOrder,
  listOrders,
  recentOrders,
} from './orders.service.js';

/**
 * Sales and receipts. Open to both roles — cashiers take orders and reprint
 * receipts, which is exactly what the frontend's nav allows.
 */
export const router: Router = Router();

/**
 * `/orders/recent` precedes `/orders/:id`. `recent` is not a valid ObjectId, so
 * the other order would match first and answer 422 about an id the caller never
 * sent.
 */
router.get(
  '/orders/recent',
  requireSession,
  validate({ query: recentQuery }),
  recent,
);
router.post(
  '/orders',
  requireSession,
  validate({ body: createOrderInput }),
  create,
);
router.get('/orders', requireSession, validate({ query: orderQuery }), list);
router.get('/orders/:id', requireSession, validate({ params: idParam }), get);

async function list(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await listOrders(parsed<unknown, OrderQuery>(req).query));
}

async function get(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getOrder(routeIdOf(req)));
}

async function recent(req: Request, res: Response): Promise<void> {
  const { limit } = parsed<unknown, { limit: number }>(req).query;
  res.status(200).json(await recentOrders(limit));
}

async function create(req: Request, res: Response): Promise<void> {
  const idempotencyKey = header(req, 'idempotency-key');

  const result = await createOrder(
    parsed<CreateOrderInput>(req).body,
    sessionUser(req),
    idempotencyKey,
  );

  // A replay is a read of something already created, so 200 rather than a second
  // 201 — the client sees "here is your receipt", not "a new sale happened".
  res
    .status(result.replayed ? 200 : 201)
    .set('Idempotent-Replay', result.replayed ? 'true' : 'false')
    .json({ order: result.order, movements: result.movements });
}

function routeIdOf(req: Request): string {
  return parsed<unknown, unknown, { id: string }>(req).params.id;
}

function header(req: Request, name: string): string | undefined {
  const raw = req.get(name);
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  // A blank header is not a key. Storing one would make every untagged request
  // a replay of the first.
  return trimmed.length > 0 ? trimmed.slice(0, 200) : undefined;
}
