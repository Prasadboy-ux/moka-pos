import { Router, type Request, type Response } from 'express';
import { parsed, validate } from '../../lib/validate.js';
import {
  requireRole,
  requireSession,
  sessionUser,
} from '../../middleware/session.js';
import {
  adjustInput,
  levelQuery,
  movementFilter,
  type AdjustInput,
  type LevelQuery,
  type MovementFilter,
} from './stock.schemas.js';
import {
  adjustStock,
  levelOf,
  listMovements,
  stockValue,
} from './stock.service.js';

/**
 * Inventory. Admin-only throughout, matching the frontend's `/dashboard/inventory`
 * nav entry — cashiers have no stock screen and no reason to move stock.
 */
export const router: Router = Router();

router.get(
  '/stock/movements',
  requireSession,
  requireRole('admin'),
  validate({ query: movementFilter }),
  movements,
);
router.get(
  '/stock/level',
  requireSession,
  requireRole('admin'),
  validate({ query: levelQuery }),
  level,
);
router.get('/stock/value', requireSession, requireRole('admin'), value);
router.post(
  '/stock/adjust',
  requireSession,
  requireRole('admin'),
  validate({ body: adjustInput }),
  adjust,
);

async function movements(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await listMovements(parsed<unknown, MovementFilter>(req).query));
}

async function level(req: Request, res: Response): Promise<void> {
  res.status(200).json(await levelOf(parsed<unknown, LevelQuery>(req).query));
}

async function value(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await stockValue());
}

async function adjust(req: Request, res: Response): Promise<void> {
  const movement = await adjustStock(
    parsed<AdjustInput>(req).body,
    sessionUser(req),
  );
  res.status(201).json(movement);
}
