"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { CartPanel } from "@/components/pos/CartPanel";
import { CheckoutDialog } from "@/components/pos/CheckoutDialog";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { useAsync } from "@/hooks/useAsync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQueryState } from "@/hooks/useQueryState";
import { getRepositories } from "@/lib/repositories";
import { computeTotals, useCartStore } from "@/store/useCartStore";
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
  const products = menu.data?.products ?? null;
  const categories: Category[] = menu.data?.categories ?? [];
  const ingredients: Map<string, Ingredient> = menu.data?.ingredients ?? new Map();

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

  function handleAdd(product: Product) {
    add(product);
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

  if (menu.isLoading || !products) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading menu</span>
      </div>
    );
  }

  if (menu.error) {
    return (
      <p role="alert" className="py-20 text-center text-sm text-destructive">
        {menu.error}
      </p>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <ProductGrid
        products={products}
        categories={categories}
        ingredients={ingredients}
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
          totals={totals}
          taxRate={taxRate}
          onSetQty={setQty}
          onRemove={remove}
          onClear={clear}
          onCheckout={() => setCheckoutOpen(true)}
        />
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        lines={lines}
        totals={totals}
        cashierId={user?.id ?? ""}
        cashierName={user?.name ?? ""}
        onCompleted={handleCompleted}
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