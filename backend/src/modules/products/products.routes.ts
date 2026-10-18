import { Router, type Request, type Response } from 'express';
import { idParam } from '../../lib/schemas.js';
import { parsed, routeId, validate } from '../../lib/validate.js';
import { requireRole, requireSession } from '../../middleware/session.js';
import {
  productInput,
  productQuery,
  setActiveInput,
  type ProductInput,
  type ProductQuery,
  type SetActiveInput,
} from './products.schemas.js';
import {
  createProduct,
  getProduct,
  listProducts,
  removeProduct,
  setProductActive,
  updateProduct,
} from './products.service.js';

export const router: Router = Router();

/** `PATCH /:id/active` is a literal path, so it must precede `/:id` patterns. */
router.patch(
  '/products/:id/active',
  requireSession,
  requireRole('admin'),
  validate({ params: idParam, body: setActiveInput }),
  setActive,
);
router.post(
  '/products',
  requireSession,
  requireRole('admin'),
  validate({ body: productInput }),
  create,
);
router.get(
  '/products',
  requireSession,
  validate({ query: productQuery }),
  list,
);
router.get('/products/:id', requireSession, validate({ params: idParam }), get);
router.put(
  '/products/:id',
  requireSession,
  requireRole('admin'),
  validate({ params: idParam, body: productInput }),
  update,
);
router.delete(
  '/products/:id',
  requireSession,
  requireRole('admin'),
  validate({ params: idParam }),
  remove,
);

async function list(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await listProducts(parsed<unknown, ProductQuery>(req).query));
}

async function get(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getProduct(routeId(req)));
}

async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await createProduct(parsed<ProductInput>(req).body));
}

async function update(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await updateProduct(routeId(req), parsed<ProductInput>(req).body));
}

async function setActive(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await setProductActive(routeId(req), parsed<SetActiveInput>(req).body),
    );
}

async function remove(req: Request, res: Response): Promise<void> {
  await removeProduct(routeId(req));
  res.status(204).end();
}
