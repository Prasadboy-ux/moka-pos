import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireSession } from '../../middleware/session.js';
import { parsed, validate } from '../../lib/validate.js';
import { reportQuery, type ReportQuery } from './reports.schemas.js';
import { salesReport } from './reports.service.js';

/**
 * Store performance.
 *
 * Both roles may read a report. A kasir's own screen already shows the day's
 * takings in the counter's tiles; hiding the aggregate the receipts already
 * print would be security theatre, and the till is where a shift is closed
 * against exactly these figures. Writes never happen here, so there is nothing
 * to gate by role.
 */
export const router: Router = Router();

router.get(
  '/reports/sales',
  requireSession,
  validate({ query: reportQuery }),
  sales,
);

async function sales(req: Request, res: Response): Promise<void> {
  const query = parsed<unknown, ReportQuery>(req).query;
  res.status(200).json(await salesReport(query));
}
