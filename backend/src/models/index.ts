/**
 * Every model in one place, so `autoIndex` and test resets have a single list
 * to walk and a new model cannot be added without registering it.
 */

export {
  UserModel,
  findByUsername,
  toSessionUser,
  type Role,
  type SessionUser,
  type User,
} from './user.model.js';
export { CategoryModel, type Category } from './category.model.js';
export { IngredientModel, type Ingredient } from './ingredient.model.js';
export {
  ProductModel,
  type Product,
  type RecipeItem,
} from './product.model.js';
export {
  OrderModel,
  type Order,
  type OrderLine,
  type OrderCustomer,
} from './order.model.js';
export {
  StockMovementModel,
  type StockMovement,
} from './stock-movement.model.js';
export { ShiftModel, type Shift } from './shift.model.js';
export { CounterModel } from './counter.model.js';
export { IdempotencyKeyModel } from './idempotency-key.model.js';
export { USERNAME_COLLATION, toApiJson } from './shared.js';

import { CategoryModel } from './category.model.js';
import { CounterModel } from './counter.model.js';
import { IdempotencyKeyModel } from './idempotency-key.model.js';
import { IngredientModel } from './ingredient.model.js';
import { OrderModel } from './order.model.js';
import { ProductModel } from './product.model.js';
import { ShiftModel } from './shift.model.js';
import { StockMovementModel } from './stock-movement.model.js';
import { UserModel } from './user.model.js';

/**
 * The two operations the seed and the test reset need. Declared narrowly so the
 * tuple of nine differently-shaped models stays usable from a loop without
 * erasing every model's type to reach it.
 */
export type ResettableModel = {
  deleteMany(filter: Record<string, unknown>): Promise<unknown>;
  syncIndexes(): Promise<unknown>;
};

/** Used to wipe and reindex. Adding a model means adding it here too. */
export const ALL_MODELS: ResettableModel[] = [
  UserModel,
  CategoryModel,
  IngredientModel,
  ProductModel,
  OrderModel,
  StockMovementModel,
  ShiftModel,
  CounterModel,
  IdempotencyKeyModel,
];
