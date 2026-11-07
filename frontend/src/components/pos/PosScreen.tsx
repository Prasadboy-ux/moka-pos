"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Banknote, Coffee, RotateCcw } from "lucide-react";
import { FlyToCart } from "@/components/motion/FlyToCart";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { CartPanel } from "@/components/pos/CartPanel";
import { CheckoutDialog } from "@/components/pos/CheckoutDialog";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { CloseShiftDialog, OpenShiftDialog } from "@/components/pos/ShiftDialogs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsync } from "@/hooks/useAsync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFlyToCart } from "@/hooks/useFlyToCart";
import { useQueryState } from "@/hooks/useQueryState";
import { formatDateTime, formatIDR } from "@/lib/format";
import {
  checkoutSignature,
  reuseCheckoutKey,
  type CheckoutKey,
} from "@/lib/idempotency";
import { DURATION, EASE_OUT, fadeUp, stagger } from "@/lib/motion";
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
  const { products, categories, ingredients, config } = getRepositories();

  const [productList, categoryList, ingredientList, settings] =
    await Promise.all([
      products.list(),
      categories.list(),
      ingredients.list(),
      config.get(),
    ]);

  return {
    products: productList,
    categories: categoryList,
    ingredients: new Map(ingredientList.map((i) => [i.id, i])),
    taxRate: settings.taxRate,
  };
}

export function PosScreen() {
  const user = useAuthStore((state) => state.session?.user ?? null);
  const reduceMotion = useReducedMotion();
  const cartDropRef = useRef<HTMLDivElement>(null);
  const { flight, launch, clear: clearFlight } = useFlyToCart();

  const menu = useAsync(loadMenu);

  /**
   * The open shift gates selling, so the POS loads it alongside the menu.
   * Wrapped in `{ shift }` because the API answers `null` for "no open shift" —
   * a normal result, not a missing payload — and `useAsync` would otherwise
   * read a settled null as still-loading forever.
   *
   * The session user's id is read straight from the store: the HTTP repository
   * ignores it (the server resolves the session), while the mock has no session
   * concept and genuinely needs the id to find the right open shift. Read at
   * call time, not render time, so a late hydration cannot strand a "".
   */
  const shiftState = useAsync(
    async () => ({
      shift: await getRepositories().shifts.current(
        useAuthStore.getState().session?.user?.id ?? "",
      ),
    }),
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
  const cartSignature = useMemo(() => checkoutSignature(lines), [lines]);

  /**
   * Held here rather than inside CheckoutDialog: closing and reopening the
   * dialog for the same cart must reuse the key, otherwise a retry after a lost
   * response becomes a second order. Cleared once the sale is committed, so
   * starting an identical cart later mints a fresh key.
   */
  const [checkoutKey, setCheckoutKey] = useState<CheckoutKey | null>(null);
  const taxRate = useCartStore((state) => state.taxRate);
  const setTaxRate = useCartStore((state) => state.setTaxRate);
  const add = useCartStore((state) => state.add);
  const setQty = useCartStore((state) => state.setQty);
  const remove = useCartStore((state) => state.remove);
  const clear = useCartStore((state) => state.clear);
  const qtyOf = useCartStore((state) => state.qtyOf);

  /**
   * Restore a cart left behind by a refresh. Hydration is manual because the
   * server has no `sessionStorage`; waiting until after mount keeps the first
   * client render identical to the server's empty cart.
   */
  useEffect(() => {
    void useCartStore.persist.rehydrate();
  }, []);

  /**
   * The rate shown in the cart comes from the API, not a frontend constant.
   * Otherwise an env change on the server made the customer pay one total while
   * the cashier quoted another.
   */
  useEffect(() => {
    if (menu.data) setTaxRate(menu.data.taxRate);
  }, [menu.data, setTaxRate]);

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

  function handleAdd(product: Product, origin: DOMRect) {
    add(product, 1, limits.get(product.id) ?? null);

    if (reduceMotion) return;

    const drop = cartDropRef.current?.getBoundingClientRect();
    if (!drop) return;
    if (drop.top > window.innerHeight || drop.bottom < 0) return;

    launch(product.image, origin, drop);
  }

  function handleSetQty(productId: string, qty: number) {
    const product = stockContext.products.get(productId);
    setQty(productId, qty, product ? cartLimit(lines, product, stockContext) : null);
  }

  function openCheckout() {
    setCheckoutKey((current) => reuseCheckoutKey(current, cartSignature));
    setCheckoutOpen(true);
  }

  /** The mobile dock has no room for the cart itself, so it jumps to it. */
  function scrollToCart() {
    cartDropRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  function handleCompleted(order: Order) {
    clear();
    setCheckoutKey(null);
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
      <div className="space-y-5" aria-busy>
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-20 rounded-full" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
              ))}
            </div>
          </div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
        <span className="sr-only">Loading menu</span>
      </div>
    );
  }

  if (menu.error || shiftState.error) {
    return (
      <Alert variant="destructive" className="mx-auto mt-16 max-w-md">
        <AlertTitle>Could not load the till</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>{menu.error ?? shiftState.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              menu.reload();
              shiftState.reload();
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
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
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.page, ease: EASE_OUT }}
          className="w-full max-w-md space-y-4 rounded-xl border bg-card p-8 text-center"
        >
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
        </motion.div>

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
    <div className="relative space-y-5 pb-24 lg:pb-0">
      {/* The till has no PageHeader; this is the document's h1. */}
      <h1 className="sr-only">Point of Sale</h1>

      {/**
       * A soft brand wash behind the working surfaces. Purely decorative — it
       * gives the white cards something to sit on without tinting the content
       * itself, and it never intercepts a tap.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 -z-10 h-80 overflow-hidden"
      >
        <motion.span
          animate={
            reduceMotion ? undefined : { x: [0, 24, 0], y: [0, -14, 0] }
          }
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-20 top-0 size-72 rounded-full bg-brand-cyan/10 blur-3xl"
        />
        <motion.span
          animate={
            reduceMotion ? undefined : { x: [0, -20, 0], y: [0, 12, 0] }
          }
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/3 top-4 size-64 rounded-full bg-brand-blue/10 blur-3xl"
        />
        <motion.span
          animate={
            reduceMotion ? undefined : { x: [0, 16, 0], y: [0, 10, 0] }
          }
          transition={{ duration: 23, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-16 -top-6 size-72 rounded-full bg-primary/10 blur-3xl"
        />
      </div>

      {/**
       * Staggered entrance: strip first, then the menu column and the cart.
       * Each child uses the shared `fadeUp`, so the screen reads as one motion
       * language rather than three independently tuned reveals.
       */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="space-y-5"
      >
        <motion.div
          variants={fadeUp}
          className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border bg-card/80 px-4 py-3 shadow-sm backdrop-blur-md"
        >
          {/* Hairline of brand light along the top edge of the strip. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-cyan/70 to-transparent"
          />

          <div className="flex items-center gap-3 text-sm">
            <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Coffee className="size-4" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-2 font-medium">
                <span className="relative flex size-2.5 items-center justify-center">
                  {/* Live pulse: the shift is open and selling right now. */}
                  <motion.span
                    aria-hidden
                    animate={
                      reduceMotion
                        ? undefined
                        : { scale: [1, 2.2], opacity: [0.45, 0] }
                    }
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                    className="absolute size-2.5 rounded-full bg-success"
                  />
                  <span className="relative size-2 rounded-full bg-success" />
                </span>
                Shift open since {formatDateTime(shift.openedAt)}
              </span>
              <span className="text-xs text-muted-foreground sm:text-sm">
                Float {formatIDR(shift.openingFloat)}
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="transition-colors hover:border-primary/40 hover:bg-primary/5"
            onClick={() => setCloseShiftOpen(true)}
          >
            Close shift
          </Button>
        </motion.div>

        {/**
         * Two columns from `lg` (1024px), not `xl`: iPad landscape is 1024–1279
         * CSS px, and at a till the cart must stay beside the grid there — a
         * single column forces the cashier to scroll past the whole menu to
         * reach Charge.
         */}
        <div className="grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
          <motion.div variants={fadeUp} className="min-w-0">
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
          </motion.div>

          <motion.div
            variants={fadeUp}
            ref={cartDropRef}
            className="h-fit overflow-hidden rounded-2xl border bg-card shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]"
          >
            <CartPanel
              lines={lines}
              limits={limits}
              totals={totals}
              taxRate={taxRate}
              products={stockContext.products}
              onSetQty={handleSetQty}
              onRemove={remove}
              onClear={clear}
              onCheckout={openCheckout}
            />
          </motion.div>
        </div>
      </motion.div>

      {/**
       * Phone-only order dock. Below `lg` the cart sits under the whole menu,
       * so without this a cashier cannot see the running total or reach Charge
       * without scrolling past every product. Sits above the app's mobile tab
       * bar; at `md` the tab bar is gone, so it drops to the bottom edge.
       */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 px-4 py-2.5 backdrop-blur-md md:bottom-0 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"} in
              order
            </p>
            <p
              className="truncate text-lg font-bold tabular-nums"
              title={formatIDR(totals.total)}
            >
              {formatIDR(totals.total)}
            </p>
          </div>

          {lines.length > 0 ? (
            <Button type="button" variant="outline" onClick={scrollToCart}>
              View order
            </Button>
          ) : null}

          <Button
            type="button"
            onClick={openCheckout}
            disabled={lines.length === 0}
          >
            Charge
          </Button>
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
        idempotencyKey={checkoutKey?.key ?? ""}
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

      <FlyToCart flight={flight} onComplete={clearFlight} />
    </div>
  );
}