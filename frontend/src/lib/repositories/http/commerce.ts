import { newIdempotencyKey } from "@/lib/idempotency";
import type { User } from "@/types/auth";
import type { Order, Shift, StockMovement } from "@/types/pos";
import type {
  CreateOrderInput,
  MovementFilter,
  OrderPage,
  OrderQuery,
  OrderRepository,
  ReportsRepository,
  SalesReportData,
  ShiftRepository,
  StockAdjustInput,
  StockMovementPage,
  StockRepository,
} from "../types";
import { ApiError, http, query, request } from "./client";

export const stockRepository: StockRepository = {
  movements: (filter: MovementFilter = {}) =>
    request<StockMovementPage>(() =>
      http.get(`/stock/movements${query({ ...filter })}`),
    ),

  adjust: (input: StockAdjustInput) => {
    // `actor` is dropped on purpose. The interface carries it only so the mock
    // has a session to read; the server takes the actor from the cookie and
    // ignores whatever a body claims.
    const { actor: _actor, ...body } = input;
    void _actor;
    return request<StockMovement>(() => http.post("/stock/adjust", body));
  },

  /**
   * A recipe product has no stock of its own, and the API answers `null` rather
   * than 0 — zero would read as "out of stock" and block a drink that is
   * perfectly sellable.
   */
  levelOf: (target: "ingredient" | "product", id: string) =>
    request<number | null>(() => http.get(`/stock/level${query({ target, targetId: id })}`)),

  value: () =>
    request<{ ingredientsValue: number; retailValue: number; total: number }>(() =>
      http.get("/stock/value"),
    ),
};

export const orderRepository: OrderRepository = {
  list: (orderQuery: OrderQuery = {}) =>
    request<OrderPage>(() => http.get(`/orders${query({ ...orderQuery })}`)),

  async getById(id: string): Promise<Order | undefined> {
    try {
      return await request<Order>(() => http.get(`/orders/${id}`));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  },

  recent: (limit?: number) =>
    request<Order[]>(() => http.get(`/orders/recent${query({ limit })}`)),

  create: (input: CreateOrderInput) => {
    // `cashier` is dropped for the same reason as `actor` above. The key is a
    // header, not part of the order body.
    const { cashier: _cashier, idempotencyKey, ...body } = input;
    void _cashier;

    const key = idempotencyKey ?? newIdempotencyKey();

    return request<{ order: Order; movements: StockMovement[] }>(() =>
      // 201 on a new sale, 200 when the key replays a receipt already issued.
      // Both are a success, so both paths land in the same result.
      http.post("/orders", body, { headers: { "Idempotency-Key": key } }),
    );
  },

  void: (id: string, reason: string, _actor?: { id: string; name: string }) => {
    void _actor;
    return request<{
      order: Order;
      movements: StockMovement[];
      warnings: string[];
    }>(() => http.post(`/orders/${id}/void`, { reason }));
  },
};

/**
 * The server owns the arithmetic a report shows: proportional revenue
 * allocation, zero-filled trend periods, the uncategorised catch-all. The
 * client shapes and presents the reply rather than refetching every receipt in
 * the range and re-adding them here.
 */
export const reportsRepository: ReportsRepository = {
  sales: (from, to, filter = {}) =>
    request<SalesReportData>(() =>
      http.get(`/reports/sales${query({ from, to, ...filter })}`),
    ),
};

export const shiftRepository: ShiftRepository = {
  // `userId` is accepted to satisfy the interface and then ignored: the API
  // resolves the current user from the session, and a body-supplied id would be
  // one more place a caller could ask for someone else's shift.
  current: (_userId: string) => request<Shift | null>(() => http.get("/shifts/current")),

  list: (shiftQuery: { cashierId?: string } = {}) =>
    request<Shift[]>(() => http.get(`/shifts${query({ ...shiftQuery })}`)),

  open: (input: { cashier: { id: string; name: string }; openingFloat: number }) => {
    const { cashier: _cashier, ...body } = input;
    void _cashier;
    return request<Shift>(() => http.post("/shifts", body));
  },

  close: (id: string, counted: number) =>
    request<Shift>(() => http.post(`/shifts/${id}/close`, { counted })),
};

/** Replaced the localStorage session; the cookie is now the only session. */
export const sessionRepository = {
  me: () => request<{ user: User }>(() => http.get("/auth/me")),
  logout: () => request<void>(() => http.post("/auth/logout")),

  /**
   * Rotates the signed-in user's own password. 204 on success; a wrong current
   * password or a reused one comes back as 422 with a field name, which the
   * dialog maps onto the input.
   */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>(() =>
      http.post("/auth/change-password", { currentPassword, newPassword }),
    ),
};