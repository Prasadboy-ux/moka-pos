import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Category,
  Ingredient,
  Order,
  OrderLine,
  Product,
} from "@/types/pos";
import {
  allocateGrossRevenue,
  bucketTrend,
  categorySales,
  dayKeyDaysAgo,
  getAdminDashboard,
  monthKey,
  monthStartMonthsAgo,
  productSales,
  summarise,
  toDayKey,
  todayKey,
} from "./read-models";

const repositories = vi.hoisted(() => ({
  products: { list: vi.fn() },
  ingredients: { list: vi.fn() },
  orders: { recent: vi.fn(), list: vi.fn() },
}));

vi.mock("@/lib/repositories", () => ({
  getRepositories: () => repositories,
}));

function line(
  productId: string,
  price: number,
  qty = 1,
  name = productId,
): OrderLine {
  return { productId, name, price, qty, stockMode: "direct" };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    receiptNo: "MOKA-1",
    lines: [],
    subtotal: 0,
    taxRate: 0.1,
    taxAmount: 0,
    total: 0,
    paymentMethod: "cash",
    paidAmount: 0,
    changeAmount: 0,
    cashierId: "cashier-1",
    cashierName: "Siti Rahayu",
    customer: null,
    createdAt: "2026-10-23T03:00:00.000Z",
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    name: "Mineral Water",
    categoryId: "category-1",
    price: 5000,
    image: "/menu/retail/mineral_water.svg",
    stockMode: "direct",
    stock: 10,
    minStock: 5,
    recipe: [],
    isActive: true,
    ...overrides,
  };
}

describe("store-calendar keys", () => {
  it("attributes an instant to the store day, not the browser day", () => {
    expect(toDayKey(Date.parse("2026-01-01T17:30:00.000Z"))).toBe("2026-01-02");
    expect(monthKey(Date.parse("2026-01-31T18:00:00.000Z"))).toBe("2026-02");
  });

  describe("with the clock frozen at 00:30 Jakarta", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-23T17:30:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("computes today and the week start on the store calendar", () => {
      expect(todayKey()).toBe("2026-10-24");
      expect(dayKeyDaysAgo(0)).toBe("2026-10-24");
      expect(dayKeyDaysAgo(6)).toBe("2026-10-18");
    });

    it("walks months without rolling the year in the wrong direction", () => {
      expect(monthStartMonthsAgo(0)).toBe("2026-10-01");
      expect(monthStartMonthsAgo(1)).toBe("2026-09-01");
      expect(monthStartMonthsAgo(12)).toBe("2025-10-01");
    });
  });
});

describe("gross revenue allocation", () => {
  it("splits an order total across lines and gives leftover rupiah away", () => {
    const allocated = allocateGrossRevenue(
      order({
        total: 10001,
        lines: [line("a", 5000), line("b", 5000)],
      }),
    );

    expect(allocated).toEqual([5001, 5000]);
    expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(10001);
  });

  it("returns zeros, not NaNs, for an empty or zero-weight order", () => {
    expect(
      allocateGrossRevenue(order({ total: 5000, lines: [line("a", 0)] })),
    ).toEqual([0]);
    expect(allocateGrossRevenue(order({ total: 0, lines: [] }))).toEqual([]);
  });

  it("makes category and product revenue add up to the KPI", () => {
    const products = [
      product({
        id: "latte",
        name: "Latte",
        categoryId: "coffee",
        price: 28000,
        stockMode: "recipe",
        recipe: [],
        stock: undefined,
        minStock: undefined,
      }),
      product({ id: "water", categoryId: "retail" }),
    ];
    const categories: Category[] = [
      { id: "coffee", name: "Coffee", sortOrder: 1 },
      { id: "retail", name: "Retail", sortOrder: 2 },
    ];
    const orders = [
      order({
        lines: [line("latte", 28000), line("water", 5000)],
        subtotal: 33000,
        taxAmount: 3300,
        total: 36300,
      }),
    ];

    const kpi = summarise(orders);
    const categoriesTotal = categorySales(orders, products, categories).reduce(
      (sum, row) => sum + row.revenue,
      0,
    );
    const productsTotal = productSales(orders).reduce(
      (sum, row) => sum + row.revenue,
      0,
    );

    expect(kpi.revenue).toBe(36300);
    expect(categoriesTotal).toBe(kpi.revenue);
    expect(productsTotal).toBe(kpi.revenue);
  });

  it("keeps a deleted product's revenue in an Uncategorised bucket", () => {
    const orders = [
      order({
        lines: [line("gone", 12000)],
        subtotal: 12000,
        taxAmount: 1200,
        total: 13200,
      }),
    ];

    const categories = categorySales(orders, [], []);

    expect(categories).toEqual([
      {
        categoryId: "__uncategorised__",
        categoryName: "Uncategorised",
        revenue: 13200,
        itemsSold: 1,
      },
    ]);
  });
});

describe("range trends", () => {
  const orders = [
    order({ total: 11000, createdAt: "2026-10-02T03:00:00.000Z" }),
  ];

  it("returns every day in a short range, including quiet days", () => {
    const { bucket, points } = bucketTrend(
      orders,
      "2026-10-01",
      "2026-10-03",
    );

    expect(bucket).toBe("day");
    expect(points).toEqual([
      { date: "2026-10-01", revenue: 0, transactions: 0 },
      { date: "2026-10-02", revenue: 11000, transactions: 1 },
      { date: "2026-10-03", revenue: 0, transactions: 0 },
    ]);
  });

  it("switches to month buckets for a long range", () => {
    const { bucket, points } = bucketTrend(
      orders,
      "2026-08-01",
      "2026-10-31",
    );

    expect(bucket).toBe("month");
    expect(points.map((point) => point.date)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(points.map((point) => point.revenue)).toEqual([0, 0, 11000]);
  });
});

describe("dashboard range", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));

    const water = product();
    const beans: Ingredient = {
      id: "beans",
      name: "House Blend Beans",
      unit: "gram",
      stock: 100,
      minStock: 1000,
      costPerUnit: 380,
    };
    const today = order({ id: "today", total: 11000 });
    const yesterday = order({
      id: "yesterday",
      total: 22000,
      createdAt: "2026-10-22T16:30:00.000Z",
    });

    repositories.products.list.mockResolvedValue([water]);
    repositories.ingredients.list.mockResolvedValue([beans]);
    repositories.orders.recent.mockResolvedValue([today, yesterday]);
    repositories.orders.list.mockResolvedValue([today, yesterday]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("asks for seven store days and keeps today's KPI separate", async () => {
    const dashboard = await getAdminDashboard();

    expect(repositories.orders.list).toHaveBeenCalledWith({
      from: "2026-10-17",
      to: "2026-10-23",
    });
    expect(dashboard.kpi).toMatchObject({
      revenue: 11000,
      transactions: 1,
      averageOrderValue: 11000,
    });
    expect(dashboard.trend).toHaveLength(2);
    expect(dashboard.lowStock.map((item) => item.id)).toEqual(["beans"]);
  });
});
