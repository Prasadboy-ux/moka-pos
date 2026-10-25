"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/format";
import { DURATION, EASE_OUT, SPRING, SPRING_SOFT } from "@/lib/motion";
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
  onAdd: (product: Product, origin: DOMRect) => void;
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
            className="pr-10 pl-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
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
        /**
         * Pops in rather than appearing abruptly: the grid just lost every
         * tile a moment ago, and an instant empty state reads like a crash.
         */
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
          className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center"
        >
          <p className="text-sm font-medium">No menu items found</p>
          <p className="text-xs text-muted-foreground">
            Try a different search or category.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {visible.map((product, index) => (
            <ProductTile
              key={product.id}
              index={index}
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
  index: number;
  product: Product;
  inCart: number;
  available: boolean;
  onAdd: (product: Product, origin: DOMRect) => void;
}

function ProductTile({
  index,
  product,
  inCart,
  available,
  onAdd,
}: ProductTileProps) {
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = window.setTimeout(() => setJustAdded(false), 550);
    return () => window.clearTimeout(timer);
  }, [justAdded]);

  return (
    <motion.button
      type="button"
      onClick={(event) => {
        if (!available) return;
        setJustAdded(true);
        onAdd(product, event.currentTarget.getBoundingClientRect());
      }}
      disabled={!available}
      aria-label={`Add ${product.name}, ${formatIDR(product.price)}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: DURATION.base,
        ease: EASE_OUT,
        delay: Math.min(index * 0.025, 0.2),
      }}
      whileTap={available ? { scale: 0.97, transition: SPRING } : undefined}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-[color,background-color,border-color,box-shadow,transform] duration-200",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        available
          ? "border-border hover:-translate-y-0.5 hover:border-primary hover:shadow-md motion-reduce:hover:translate-y-0"
          : "cursor-not-allowed border-border opacity-60",
      )}
    >
      <motion.div
        animate={{ scale: justAdded ? 1.03 : 1 }}
        transition={SPRING_SOFT}
        className="flex flex-1 flex-col overflow-hidden"
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
          <motion.span
            /**
             * The badge re-pops each time the number changes (fresh key) so the
             * cashier can see the cart took another unit without looking away
             * from the grid; a plain swap reads as nothing moved.
             */
            key={inCart}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING}
            className="absolute top-2 right-2"
          >
            <Badge className="tabular-nums shadow-sm">{inCart}</Badge>
          </motion.span>
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
      </motion.div>

      <AnimatePresence>
        {justAdded ? (
          <motion.span
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-foreground/15"
          >
            <motion.span
              initial={{ scale: 0.5, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={SPRING}
              className="grid size-10 place-items-center rounded-full bg-success text-success-foreground shadow-lg"
            >
              <Check className="size-5" strokeWidth={3} />
            </motion.span>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
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
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      whileTap={{ scale: 0.97 }}
      transition={SPRING}
      className={cn(
        /* 40px min-height: chips are pressed constantly while building an
           order, and DESIGN.md §3 sets that floor for POS controls. */
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>
          {count}
        </span>
      ) : null}
    </motion.button>
  );
}