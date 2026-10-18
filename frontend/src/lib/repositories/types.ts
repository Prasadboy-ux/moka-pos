import type { Role, StoredUser, User } from "@/types/auth";
import type {
  Category,
  Ingredient,
  MovementType,
  Order,
  OrderCustomer,
  PaymentMethod,
  Product,
  RecipeItem,
  Shift,
  StockMode,
  StockMovement,
  Unit,
} from "@/types/pos";

/**
 * The data contract every screen codes against.
 *
 * Screens depend on these interfaces, never on the mock implementation in
 * `./mock`. When the Express API exists, a new implementation of the same
 * interfaces replaces the mock and no screen changes.
 *
 * Every method is async even though the mock answers from memory, so callers are
 * already written for a network round trip.
 */

/** Shape of the whole store. Bumped through `DB_VERSION` on schema changes. */
export interface Database {
  version: number;
  categories: Category[];
  ingredients: Ingredient[];
  products: Product[];
  users: StoredUser[];
  orders: Order[];
  movements: StockMovement[];
  shifts: Shift[];
  counters: {
    /** Next receipt sequence, shared by seeded history and new sales. */
    receipt: number;
    movement: number;
  };
}

// ----------------------------------------------------------------- Categories

export interface CategoryInput {
  name: string;
  sortOrder?: number;
}

export interface CategoryRepository {
  list(): Promise<Category[]>;
  create(input: CategoryInput): Promise<Category>;
  update(id: string, input: CategoryInput): Promise<Category>;
  /** Refuses while products still reference the category. */
  remove(id: string): Promise<void>;
  /** Persists the given order as the category display order. */
  reorder(orderedIds: string[]): Promise<Category[]>;
}

// ---------------------------------------------------------------- Ingredients

export interface IngredientInput {
  name: string;
  unit: Unit;
  minStock: number;
  costPerUnit: number;
}

export interface IngredientRepository {
  list(): Promise<Ingredient[]>;
  getById(id: string): Promise<Ingredient | undefined>;
  create(input: IngredientInput): Promise<Ingredient>;
  update(id: string, input: IngredientInput): Promise<Ingredient>;
}

// -------------------------------------------------------------------- Products

export interface ProductInput {
  name: string;
  categoryId: string;
  price: number;
  image: string;
  stockMode: StockMode;
  /** Required when `stockMode` is `direct`. */
  stock?: number;
  minStock?: number;
  recipe: RecipeItem[];
  isActive: boolean;
}

export interface ProductQuery {
  /** Defaults to active products only. */
  includeInactive?: boolean;
  categoryId?: string;
  search?: string;
}

export interface ProductRepository {
  list(query?: ProductQuery): Promise<Product[]>;
  getById(id: string): Promise<Product | undefined>;
  create(input: ProductInput): Promise<Product>;
  update(id: string, input: ProductInput): Promise<Product>;
  /** Takes a product off the menu without removing it from the record. */
  setActive(id: string, isActive: boolean): Promise<Product>;
  /**
   * Deletes the record outright.
   *
   * Past orders keep their own copy of the name and price, so receipts and
   * historical totals stay correct — a category split on a deleted product
   * falls back to "Uncategorised" rather than dropping its revenue.
   */
  remove(id: string): Promise<void>;
}

// ----------------------------------------------------------------------- Stock

export type MovementFilter = {
  type?: MovementType;
  ingredientId?: string;
  productId?: string;
};

export interface StockAdjustInput {
  /** Which side of the recipe/direct split is being adjusted. */
  target: "ingredient" | "product";
  targetId: string;
  type: Exclude<MovementType, "sale">;
  /** Signed. Positive adds stock, negative removes it. */
  qty: number;
  note: string;
  actor: { id: string; name: string };
}

export interface StockRepository {
  /** All movements, newest first. */
  movements(filter?: MovementFilter): Promise<StockMovement[]>;
  /** Applies a signed change and records the ledger entry. */
  adjust(input: StockAdjustInput): Promise<StockMovement>;
  /** Current level for either stock mode, in one shape. */
  levelOf(target: "ingredient" | "product", id: string): Promise<number | null>;
  /**
   * Stock value in rupiah. Ingredients carry a real unit cost; direct-stock
   * items have no cost on the model, so they are valued at selling price and
   * reported separately rather than summed into a misleading single figure.
   */
  value(): Promise<{
    ingredientsValue: number;
    retailValue: number;
    total: number;
  }>;
}

// ----------------------------------------------------------------------- Users

export interface UserInput {
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  /** Required on create, optional on edit. */
  password?: string;
}

export interface UserRepository {
  list(): Promise<User[]>;
  create(input: UserInput): Promise<User>;
  update(id: string, input: UserInput): Promise<User>;
  setActive(id: string, isActive: boolean): Promise<User>;
  /**
   * Verifies credentials without creating a session.
   * Failures are typed so the login screen can show a specific message.
   */
  authenticate(
    username: string,
    password: string,
  ): Promise<
    | { ok: true; user: User }
    | { ok: false; reason: "invalid" | "inactive" }
  >;
}

// ----------------------------------------------------------------------- Orders

export interface CreateOrderInput {
  lines: Array<{
    productId: string;
    qty: number;
  }>;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  cashier: { id: string; name: string };
  /**
   * Omitted for a walk-in. Carried on the order so the receipt can be sent after
   * the customer has left, and so the transaction screen can be searched by the
   * name or number they gave.
   */
  customer?: OrderCustomer | null;
}

export interface OrderQuery {
  cashierId?: string;
  /** Inclusive start, inclusive end. */
  from?: string;
  to?: string;
}

export interface OrderRepository {
  list(query?: OrderQuery): Promise<Order[]>;
  getById(id: string): Promise<Order | undefined>;
  recent(limit?: number): Promise<Order[]>;
  /**
   * Records the sale, decrements stock for every line, and writes the matching
   * ledger movements in one atomic write.
   */
  create(input: CreateOrderInput): Promise<{
    order: Order;
    movements: StockMovement[];
  }>;
}

// ----------------------------------------------------------------------- Shifts

export interface ShiftRepository {
  current(userId: string): Promise<Shift | null>;
  list(query?: { cashierId?: string }): Promise<Shift[]>;
  open(input: {
    cashier: { id: string; name: string };
    openingFloat: number;
  }): Promise<Shift>;
  close(id: string, counted: number): Promise<Shift>;
}

export interface Repositories {
  categories: CategoryRepository;
  ingredients: IngredientRepository;
  products: ProductRepository;
  stock: StockRepository;
  users: UserRepository;
  orders: OrderRepository;
  shifts: ShiftRepository;
}