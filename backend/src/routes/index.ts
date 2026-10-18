import type { Request, Response } from 'express';
import { Router } from 'express';
import { databaseState } from '../db/connection.js';
import { router as authRouter } from '../modules/auth/auth.routes.js';

/**
 * The whole URL surface. One import per module — adding a feature means adding
 * a folder under `src/modules/` and one line here, and nowhere else needs to
 * know.
 *
 * `GET /api/health` is the exception to the contract: it is an operational probe
 * rather than a product endpoint, so a deployment can be checked without a
 * browser or a session.
 */
export const router: Router = Router();

router.get('/health', (_req: Request, res: Response): void => {
  const db = databaseState();
  res
    .status(db === 'up' ? 200 : 503)
    .json({ status: db === 'up' ? 'ok' : 'degraded', db });
});

router.use(authRouter);
