import { Router, type Request, type Response } from 'express';
import { idParam } from '../../lib/schemas.js';
import { parsed, routeId, validate } from '../../lib/validate.js';
import { requireRole, requireSession } from '../../middleware/session.js';
import {
  ingredientInput,
  type IngredientInput,
} from './ingredients.schemas.js';
import {
  createIngredient,
  getIngredient,
  listIngredients,
  updateIngredient,
} from './ingredients.service.js';

export const router: Router = Router();

/**
 * There is no delete route, and that is a decision rather than an omission.
 * Removing an ingredient would orphan every recipe row pointing at it. It leaves
 * the menu by being dropped from recipes or renamed out of use — the same way a
 * superseded line on a menu does.
 */
router.post(
  '/ingredients',
  requireSession,
  requireRole('admin'),
  validate({ body: ingredientInput }),
  create,
);
router.get('/ingredients', requireSession, list);
router.get(
  '/ingredients/:id',
  requireSession,
  validate({ params: idParam }),
  get,
);
router.put(
  '/ingredients/:id',
  requireSession,
  requireRole('admin'),
  validate({ params: idParam, body: ingredientInput }),
  update,
);

async function list(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await listIngredients());
}

async function get(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getIngredient(routeId(req)));
}

async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await createIngredient(parsed<IngredientInput>(req).body));
}

async function update(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await updateIngredient(routeId(req), parsed<IngredientInput>(req).body),
    );
}
