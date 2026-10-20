"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { CartPanel } from "@/components/pos/CartPanel";
import { CheckoutDialog } from "@/components/pos/CheckoutDialog";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { CloseShiftDialog, OpenShiftDialog } from "@/components/pos/ShiftDialogs";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/hooks/useAsync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQueryState } from "@/hooks/useQueryState";
import { formatDateTime, formatIDR } from "@/lib/format";
import { getRepositories } from "@/lib/repositories";
import {
  cartLimit,
  computeTotals,
  useCartStore,
  type CartStockContext,
} from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { Category, Ingredient, Order, Product } from "@/types/pos";

/** Products, categories, and ingredient levels, fetched as one snapshot. */
async function loadMenu() {
  const { products, categories, ingredients } = getRepositories();

  const [productList, categoryList, ingredientList] = await Promise.all([
    products.list(),
    categories.list(),
    ingredients.list(),
  ]);

  return {
    products: productList,
    categories: categoryList,
    ingredients: new Map(ingredientList.map((i) => [i.id, i])),
  };
}

export function PosScreen() {
  const user = useAuthStore((state) => state.session?.user ?? null);

  const menu = useAsync(loadMenu);

  /**
   * The open shift gates selling, so the POS loads it alongside the menu.
   * Wrapped in `{ shift }` because the API answers `null` for "no open shift" —
   * a normal result, not a missing payload — and `useAsync` would otherwise
   * read a settled null as still-loading forever.
   *
   * `userId` is ignored by the repository: the server reads the session.
   */
  const shiftState = useAsync(
    async () => ({ shift: await getRepositories().shifts.current("") }),
    [],
  );
  const shift = shiftState.data?.shift ?? null;
  const products = menu.data?.products ?? null;
  const categories: Category[] = menu.data?.categories ?? [];
  /**
   * Memoised rather than defaulted inline: the `?? new Map()` fallback would
   * hand the limit memo a fresh Map on every render, and that memo is what the
   * grid, the cart, and the reducer all read their numbers from.
   */
  const ingredients = useMemo<Map<string, Ingredient>>(
    () => menu.data?.ingredients ?? new Map(),
    [menu.data?.ingredients],
  );

  /**
   * Category and search live in the URL. At a till this is mostly about
   * recovery: if the page reloads mid-rush the cashier gets the same category
   * back instead of an unfiltered grid, and a URL can be handed to another till
   * to show the same view. Search stays local while typing and is written on a
   * debounce, so no keystroke becomes a navigation.
   */
  const [query, setQuery] = useQueryState();
  const category = query.cat ?? null;
  const [search, setSearch] = useState(query.q ?? "");

  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setQuery({ q: debouncedSearch.trim() || null });
  }, [debouncedSearch, setQuery]);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);

const lines = useCartStore((state) => state.lines);
  const taxRate = useCartStore((state) => state.taxRate);
  const add = useCartStore((state) => state.add);
  const setQty = useCartStore((state) => state.setQty);
  const remove = useCartStore((state) => state.remove);
  const clear = useCartStore((state) => state.clear);
  const qtyOf = useCartStore((state) => state.qtyOf);

  const totals = useMemo(
    () => computeTotals(lines, taxRate),
    [lines, taxRate],
  );

  /**
   * What is still sellable, worked out once and shared by the grid, the cart, and
   * the reducer.
   *
   * The limit depends on the rest of the cart, because two drinks sharing an
   * ingredient compete for the same milk, so it has to be recomputed whenever a
   * line changes — and all three consumers must be told the same number, or the
   * tile says yes while the stepper says no.
   */
  const stockContext: CartStockContext = useMemo(
    () => ({
      products: new Map((products ?? []).map((p) => [p.id, p])),
      ingredients,
    }),
    [products, ingredients],
  );

  const limits = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const product of products ?? []) {
      map.set(product.id, cartLimit(lines, product, stockContext));
    }
    return map;
  }, [lines, products, stockContext]);

  function handleAdd(product: Product) {
    add(product, 1, limits.get(product.id) ?? null);
  }

  function handleSetQty(productId: string, qty: number) {
    const product = stockContext.products.get(productId);
    setQty(productId, qty, product ? cartLimit(lines, product, stockContext) : null);
  }

  function handleCompleted(order: Order) {
    clear();
    setCheckoutOpen(false);
    setReceipt(order);

    /**
     * The sale just moved stock and wrote ledger rows, so the grid's stock
     * badges and its sellability checks are stale until it refetches.
     */
    menu.reload();
  }

  if (menu.isLoading || shiftState.isLoading || !products) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading menu</span>
      </div>
    );
  }

  if (menu.error || shiftState.error) {
    return (
      <p role="alert" className="py-20 text-center text-sm text-destructive">
        {menu.error ?? shiftState.error}
      </p>
    );
  }

  /**
   * The gate. No open shift means no grid, no cart, no checkout — the only
   * thing this till can do is open its drawer. The server refuses the sale
   * too, so this is the fast path for the operator, not the security boundary.
   */
  if (!shift) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Banknote className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold">Open a shift to sell</h2>
          <p className="text-sm text-muted-foreground">
            Every sale is recorded against your shift, and the drawer is counted
            down against it when you close.
          </p>
          <Button type="button" onClick={() => setOpenShiftOpen(true)}>
            Open shift
          </Button>
        </div>

        <OpenShiftDialog
          open={openShiftOpen}
          onOpenChange={setOpenShiftOpen}
          cashier={{ id: user?.id ?? "", name: user?.name ?? "" }}
          onOpened={() => {
            setOpenShiftOpen(false);
            shiftState.reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2.5 text-sm">
          <span
            className="size-2 rounded-full bg-emerald-500"
            aria-hidden
          />
          <span>Shift open since {formatDateTime(shift.openedAt)}</span>
          <span className="text-muted-foreground">
            · Float {formatIDR(shift.openingFloat)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCloseShiftOpen(true)}
        >
          Close shift
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <ProductGrid
          products={products}
          categories={categories}
          limits={limits}
          activeCategory={category}
          onCategoryChange={(value) => setQuery({ cat: value })}
          search={search}
          onSearchChange={setSearch}
          onAdd={handleAdd}
          qtyOf={qtyOf}
        />

        <div className="h-fit rounded-xl border bg-card xl:sticky xl:top-4 xl:max-h-[calc(100vh-8rem)]">
          <CartPanel
            lines={lines}
            limits={limits}
            totals={totals}
            taxRate={taxRate}
            onSetQty={handleSetQty}
            onRemove={remove}
            onClear={clear}
            onCheckout={() => setCheckoutOpen(true)}
          />
        </div>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        lines={lines}
        totals={totals}
        taxRate={taxRate}
        cashierId={user?.id ?? ""}
        cashierName={user?.name ?? ""}
        onCompleted={handleCompleted}
        onShiftRequired={() => {
          // The shift was closed underneath this sale (another till, an admin).
          // Drop back to the gate instead of leaving a checkout that cannot land.
          setCheckoutOpen(false);
          setReceipt(null);
          shiftState.reload();
        }}
      />

      <CloseShiftDialog
        open={closeShiftOpen}
        onOpenChange={setCloseShiftOpen}
        shift={shift}
        onClosed={() => {
          setCloseShiftOpen(false);
          shiftState.reload();
        }}
      />

      <ReceiptModal
        order={receipt}
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      />
    </div>
  );
}