import type { Role, StoredUser, User } from "@/types/auth";
import type {
  Category,
  Ingredient,
  MovementType,
  Order,
  OrderCustomer,
  OrderStatus,
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
export interface AppConfig {
  /** PPN rate the server charges, so the cart total matches the receipt. */
  taxRate: number;
  /** IANA zone the API uses to bucket days for reports. */
  storeTimezone: string;
}

export interface ConfigRepository {
  get(): Promise<AppConfig>;
}

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
  /** Page bounds. 200 newest by default. */
  limit?: number;
  offset?: number;
};

export interface StockMovementPage {
  data: StockMovement[];
  /** Total matching rows before pagination, for the caller's page arithmetic. */
  total: number;
  limit: number;
  offset: number;
}

export interface StockAdjustInput {
  /** Which side of the recipe/direct split is being adjusted. */
  target: "ingredient" | "product";
  targetId: string;
  /** Manual adjustments can never fake a `sale`; `void` belongs to order reversals. */
  type: Exclude<MovementType, "sale" | "void">;
  /** Signed. Positive adds stock, negative removes it. */
  qty: number;
  note: string;
  actor: { id: string; name: string };
}

export interface StockRepository {
  /**
   * The newest slice of the audit trail, newest first. The ledger grows with
   * every sale, so the reply is a page — `total` tells the caller how deep the
   * history goes without shipping all of it.
   */
  movements(filter?: MovementFilter): Promise<StockMovementPage>;
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
    role?: Role,
  ): Promise<
    | { ok: true; user: User }
    | { ok: false; reason: "invalid" | "inactive" | "role-mismatch" }
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
   * Stable across retries of one checkout attempt. The HTTP repository sends it
   * as `Idempotency-Key`; the mock ignores it because it cannot be replayed.
   */
  idempotencyKey?: string;
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
  /** Voided receipts stay listable for audit with an explicit filter. */
  status?: OrderStatus;
  /**
   * How a customer names a sale on the phone: receipt number, their name on it,
   * or the phone they gave. Matched server-side as a substring.
   */
  q?: string;
  method?: PaymentMethod;
  /**
   * Page bounds. `total` on the reply is the number of rows matching the
   * filters, so the caller can page without ever loading the whole ledger.
   */
  limit?: number;
  offset?: number;
}

/**
 * One window over the order ledger. `data` alone would be indistinguishable
 * from "the ledger ends here", so the page also carries the filtered total and
 * the bounds it served — the arithmetic a screen needs to draw a pager.
 */
export interface OrderPage {
  data: Order[];
  total: number;
  limit: number;
  offset: number;
}

export interface OrderRepository {
  list(query?: OrderQuery): Promise<OrderPage>;
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
  /**
   * Reverses a paid sale: stock is returned through positive `void` movements
   * and the receipt flips to `voided`. Every report treats a voided order as
   * never sold.
   */
  void(
    id: string,
    reason: string,
    /** Mock-only, like `cashier` on create. HTTP resolves the actor from the session cookie. */
    actor?: { id: string; name: string },
  ): Promise<{
    order: Order;
    movements: StockMovement[];
    /** Stock that could not be restored and why, shown to the admin. */
    warnings: string[];
  }>;
}

// ----------------------------------------------------------------------- Reports

export type TrendBucket = "day" | "month";

/**
 * The aggregate shape `GET /api/reports/sales` answers and `getSalesReport`
 * consumes. Presentation-only derivations (`share`, display labels, deltas
 * against the previous period) stay with the caller.
 */
export interface SalesReportData {
  from: string;
  to: string;
  kpi: {
    revenue: number;
    transactions: number;
    averageOrderValue: number;
    itemsSold: number;
    /** Paid receipts carrying a phone number — the ones WhatsApp can reach. */
    withCustomer: number;
  };
  paymentBreakdown: {
    method: PaymentMethod;
    count: number;
    total: number;
  }[];
  trend: {
    bucket: TrendBucket;
    points: Array<{ date: string; revenue: number; transactions: number }>;
  };
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    revenue: number;
    itemsSold: number;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  byCashier: Array<{
    cashierId: string;
    cashierName: string;
    transactions: number;
    revenue: number;
    averageOrderValue: number;
    itemsSold: number;
  }>;
}

export interface SalesReportFilter {
  method?: PaymentMethod;
  /**
   * The same customer-facing search the ledger list answers, so a filtered
   * table and its tiles above it are the same question about the same window.
   */
  q?: string;
}

export interface ReportsRepository {
  /** The paid-only aggregate for one closed range. */
  sales(from: string, to: string, filter?: SalesReportFilter): Promise<SalesReportData>;
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
  config: ConfigRepository;
  categories: CategoryRepository;
  ingredients: IngredientRepository;
  products: ProductRepository;
  stock: StockRepository;
  users: UserRepository;
  orders: OrderRepository;
  reports: ReportsRepository;
  shifts: ShiftRepository;
}