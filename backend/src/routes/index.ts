import type { Request, Response } from 'express';
import { Router } from 'express';
import { databaseState } from '../db/connection.js';

/**
 * Operational endpoints. Not part of the product API contract — these exist so
 * a deployment can be checked without a browser or a session.
 */

export const router: Router = Router();

router.get('/health', (_req: Request, res: Response): void => {
  const db = databaseState();
  res
    .status(db === 'up' ? 200 : 503)
    .json({ status: db === 'up' ? 'ok' : 'degraded', db });
});
