import { Router, type Request, type Response } from 'express';
import { idParam } from '../../lib/schemas.js';
import { parsed, routeId, validate } from '../../lib/validate.js';
import { requireSession, sessionUser } from '../../middleware/session.js';
import {
  closeShiftInput,
  openShiftInput,
  shiftQuery,
  type CloseShiftInput,
  type OpenShiftInput,
  type ShiftQuery,
} from './shifts.schemas.js';
import {
  closeShift,
  currentShift,
  listShifts,
  openShift,
} from './shifts.service.js';

/**
 * Shifts. Open to both roles — opening and closing a shift is a cashier action,
 * and the admin dashboard reads them too.
 */
export const router: Router = Router();

router.get('/shifts/current', requireSession, current);
router.post(
  '/shifts',
  requireSession,
  validate({ body: openShiftInput }),
  open,
);
router.get('/shifts', requireSession, validate({ query: shiftQuery }), list);
router.post(
  '/shifts/:id/close',
  requireSession,
  validate({ params: idParam, body: closeShiftInput }),
  close,
);

async function current(req: Request, res: Response): Promise<void> {
  res.status(200).json(await currentShift(sessionUser(req)));
}

async function list(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await listShifts(parsed<unknown, ShiftQuery>(req).query));
}

async function open(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await openShift(parsed<OpenShiftInput>(req).body, sessionUser(req)));
}

async function close(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await closeShift(
        routeId(req),
        parsed<CloseShiftInput>(req).body,
        sessionUser(req),
      ),
    );
}
