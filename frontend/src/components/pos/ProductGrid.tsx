"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/format";
import type { Category, Product } from "@/types/pos";

/**
 * A null limit means nothing bounds the product — a recipe with no rows, or a
 * counted item with no level on record. Those stay sellable, matching the
 * behaviour the grid already had.
 */
function isAddable(limit: number | null): boolean {
  return limit === null || limit > 0;
}

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  /** Units still addable per product, counting what the cart already claims. */
  limits: Map<string, number | null>;
  activeCategory: string | null;
  onCategoryChange: (categoryId: string | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: (product: Product) => void;
  qtyOf: (productId: string) => number;
}

export function ProductGrid({
  products,
  categories,
  limits,
  activeCategory,
  onCategoryChange,
  search,
  onSearchChange,
  onAdd,
  qtyOf,
}: ProductGridProps) {
  const term = search.trim().toLowerCase();

  const visible = products.filter((p) => {
    if (activeCategory && p.categoryId !== activeCategory) return false;
    if (term && !p.name.toLowerCase().includes(term)) return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            name="menu-search"
            autoComplete="off"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search menu…"
            aria-label="Search menu"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <CategoryChip
            active={activeCategory === null}
            onClick={() => onCategoryChange(null)}
            label="All"
            count={products.length}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              active={activeCategory === category.id}
              onClick={() => onCategoryChange(category.id)}
              label={category.name}
              count={
                products.filter((p) => p.categoryId === category.id).length
              }
            />
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium">No menu items found</p>
          <p className="text-xs text-muted-foreground">
            Try a different search or category.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {visible.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              inCart={qtyOf(product.id)}
              available={isAddable(limits.get(product.id) ?? null)}
              onAdd={onAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ProductTileProps {
  product: Product;
  inCart: number;
  available: boolean;
  onAdd: (product: Product) => void;
}

function ProductTile({ product, inCart, available, onAdd }: ProductTileProps) {
  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      disabled={!available}
      aria-label={`Add ${product.name}, ${formatIDR(product.price)}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-[color,background-color,border-color,box-shadow,transform]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        available
          ? "border-border hover:border-primary hover:shadow-md motion-safe:active:scale-[0.98]"
          : "cursor-not-allowed border-border opacity-60",
      )}
    >
      {/**
       * The illustrations are 300x400 portraits. `object-cover` in a square box
       * crops the top and bottom, which clears the label band that used to be
       * baked into the artwork and leaves the subject centred.
       */}
      <div className="relative aspect-square w-full overflow-hidden bg-[#222]">
        {/*
          Plain <img> on purpose: next/image refuses to optimise SVG unless
          dangerouslyAllowSVG is enabled, and these are ~1 KB trusted local
          assets that gain nothing from being rasterised.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt=""
          aria-hidden
          /* The artwork ships as 300x400; declaring it gives the browser an
             intrinsic ratio before the stylesheet resolves. The square box and
             object-cover then do the cropping, unchanged. */
          width={300}
          height={400}
          loading="lazy"
          decoding="async"
          className="size-full object-cover object-center transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100"
        />

        {inCart > 0 ? (
          <Badge className="absolute top-2 right-2 tabular-nums shadow-sm">
            {inCart}
          </Badge>
        ) : null}

        {!available ? (
          <span className="absolute inset-x-0 bottom-0 bg-destructive/90 py-1 text-center text-[11px] font-semibold text-destructive-foreground">
            {/*
              Two different reasons the tile is dead, and the cashier needs to
              tell them apart: nothing on the shelf, or the shelf is all already
              in this order. The second one is a normal state during a large
              order and would otherwise look like a stock-out bug.
            */}
            {inCart > 0 ? "In this order · no more" : "Out of stock"}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-sm leading-snug font-semibold text-balance">
          {product.name}
        </p>
        <p className="mt-auto text-sm font-bold tabular-nums text-primary">
          {formatIDR(product.price)}
        </p>
      </div>
    </button>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span className={cn("ml-1 tabular-nums", active ? "opacity-80" : "opacity-60")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}