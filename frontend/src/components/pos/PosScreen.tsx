"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { CartPanel } from "@/components/pos/CartPanel";
import { CheckoutDialog } from "@/components/pos/CheckoutDialog";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import {
  listCategories,
  listIngredients,
  listProducts,
} from "@/services/products";
import { computeTotals, useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { Category, Ingredient, Order, Product } from "@/types/pos";

export function PosScreen() {
  const user = useAuthStore((state) => state.session?.user ?? null);

  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ingredients, setIngredients] = useState<Map<string, Ingredient>>(
    () => new Map(),
  );

  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<Order | null>(null);

  const lines = useCartStore((state) => state.lines);
  const taxRate = useCartStore((state) => state.taxRate);
  const add = useCartStore((state) => state.add);
  const setQty = useCartStore((state) => state.setQty);
  const remove = useCartStore((state) => state.remove);
  const clear = useCartStore((state) => state.clear);
  const qtyOf = useCartStore((state) => state.qtyOf);

  useEffect(() => {
    let cancelled = false;

    Promise.all([listProducts(), listCategories(), listIngredients()])
      .then(([productList, categoryList, ingredientList]) => {
        if (cancelled) return;
        setProducts(productList);
        setCategories(categoryList);
        setIngredients(new Map(ingredientList.map((i) => [i.id, i])));
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
  }

  if (!products) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading menu</span>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <ProductGrid
        products={products}
        categories={categories}
        ingredients={ingredients}
        activeCategory={category}
        onCategoryChange={setCategory}
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
        taxRate={taxRate}
        products={products}
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