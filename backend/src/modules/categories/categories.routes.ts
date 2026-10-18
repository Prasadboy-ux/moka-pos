import { Router, type Request, type Response } from 'express';
import { idParam } from '../../lib/schemas.js';
import { parsed, routeId, validate } from '../../lib/validate.js';
import { requireRole, requireSession } from '../../middleware/session.js';
import {
  categoryInput,
  categoryPatch,
  reorderInput,
  type CategoryInput,
  type CategoryPatch,
  type ReorderInput,
} from './categories.schemas.js';
import {
  createCategory,
  listCategories,
  removeCategory,
  reorderCategories,
  updateCategory,
} from './categories.service.js';

export const router: Router = Router();

/**
 * Declared before `/:id` on purpose.
 *
 * `/categories/order` and `/categories/:id` are different verbs on different
 * shapes, but Express matches in declaration order — registering `:id` first
 * would capture "order" as an id and answer 422 about an id the caller never
 * sent.
 */
router.put(
  '/categories/order',
  requireSession,
  requireRole('admin'),
  validate({ body: reorderInput }),
  reorder,
);
router.post(
  '/categories',
  requireSession,
  requireRole('admin'),
  validate({ body: categoryInput }),
  create,
);
router.get('/categories', requireSession, list);
router.put(
  '/categories/:id',
  requireSession,
  requireRole('admin'),
  validate({ params: idParam, body: categoryPatch }),
  update,
);
router.delete(
  '/categories/:id',
  requireSession,
  requireRole('admin'),
  validate({ params: idParam }),
  remove,
);

async function list(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await listCategories());
}

async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await createCategory(parsed<CategoryInput>(req).body));
}

async function update(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await updateCategory(routeId(req), parsed<CategoryPatch>(req).body));
}

async function remove(req: Request, res: Response): Promise<void> {
  await removeCategory(routeId(req));
  res.status(204).end();
}

async function reorder(req: Request, res: Response): Promise<void> {
  res.status(200).json(await reorderCategories(parsed<ReorderInput>(req).body));
}
