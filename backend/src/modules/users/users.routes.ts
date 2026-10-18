import { Router, type Request, type Response } from 'express';
import { idParam } from '../../lib/schemas.js';
import { parsed, routeId, validate } from '../../lib/validate.js';
import { requireRole, requireSession } from '../../middleware/session.js';
import {
  createUserInput,
  setActiveInput,
  userInput,
  type CreateUserInput,
  type UserInput,
} from './users.schemas.js';
import {
  createUser,
  getUser,
  listUsers,
  setUserActive,
  updateUser,
} from './users.service.js';

/** Account management. Admin-only, matching the frontend's `/dashboard/users`. */
export const router: Router = Router();

/**
 * There is no `DELETE /users/:id`, and that is a decision. Orders reference the
 * cashier by id, so deleting an account would leave receipts pointing at nobody.
 * An account leaves by being deactivated, which keeps the history readable.
 */
router.patch(
  '/users/:id/active',
  requireSession,
  requireRole('admin'),
  validate({ params: idParam, body: setActiveInput }),
  setActive,
);
router.post(
  '/users',
  requireSession,
  requireRole('admin'),
  validate({ body: createUserInput }),
  create,
);
router.get('/users', requireSession, requireRole('admin'), list);
router.get(
  '/users/:id',
  requireSession,
  requireRole('admin'),
  validate({ params: idParam }),
  get,
);
router.put(
  '/users/:id',
  requireSession,
  requireRole('admin'),
  validate({ params: idParam, body: userInput }),
  update,
);

async function list(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await listUsers());
}

async function get(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getUser(routeId(req)));
}

async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await createUser(parsed<CreateUserInput>(req).body));
}

async function update(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await updateUser(routeId(req), parsed<UserInput>(req).body));
}

async function setActive(req: Request, res: Response): Promise<void> {
  const { isActive } = parsed<{ isActive: boolean }>(req).body;
  res.status(200).json(await setUserActive(routeId(req), isActive));
}
