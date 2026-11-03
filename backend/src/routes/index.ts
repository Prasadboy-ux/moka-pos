import type { Request, Response } from 'express';
import { Router } from 'express';
import { env } from '../config/env.js';
import { router as authRouter } from '../modules/auth/auth.routes.js';
import { router as categoriesRouter } from '../modules/categories/categories.routes.js';
import { router as ingredientsRouter } from '../modules/ingredients/ingredients.routes.js';
import { router as ordersRouter } from '../modules/orders/orders.routes.js';
import { router as productsRouter } from '../modules/products/products.routes.js';
import { router as reportsRouter } from '../modules/reports/reports.routes.js';
import { router as shiftsRouter } from '../modules/shifts/shifts.routes.js';
import { router as stockRouter } from '../modules/stock/stock.routes.js';
import { router as usersRouter } from '../modules/users/users.routes.js';

/**
 * The whole URL surface. One import per module — adding a feature means adding
 * a folder under `src/modules/` and one line here, and nowhere else needs to
 * know.
 *
 * `GET /api/health` is the exception to the contract: it is an operational probe
 * rather than a product endpoint, so a deployment can be checked without a
 * browser or a session. It is registered in `app.ts` before the limiter rather
 * than here so the probe keeps working while the database is down.
 */

export const router: Router = Router();

/**
 * Store-wide settings the POS needs before it can price a cart.
 *
 * Public because it holds no secrets and the tax rate is printed on every
 * receipt anyway. The server is still the authority at checkout: this only keeps
 * the displayed total from drifting from what will be charged.
 */
router.get('/config', (_req: Request, res: Response): void => {
  res.status(200).json({
    taxRate: env().TAX_RATE_DEFAULT,
    storeTimezone: env().STORE_TIMEZONE,
  });
});

router.use(authRouter);
router.use(categoriesRouter);
router.use(ingredientsRouter);
router.use(productsRouter);
router.use(stockRouter);
router.use(ordersRouter);
router.use(usersRouter);
router.use(reportsRouter);
router.use(shiftsRouter);
