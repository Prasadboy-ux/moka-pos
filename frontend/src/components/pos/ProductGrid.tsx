"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Coffee, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/format";
import {
  DURATION,
  EASE_OUT,
  FEEDBACK_HOLD_MS,
  LIST_STAGGER,
  SPRING,
  SPRING_SOFT,
} from "@/lib/motion";
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
        <div className="flex items-end justify-between gap-3 px-0.5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Menu
            </p>
            <p className="text-sm text-muted-foreground">
              {visible.length} {visible.length === 1 ? "item" : "items"}{" "}
              {activeCategory || term ? "found" : "available"}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
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
            className="h-11 rounded-xl border-border bg-card pr-11 pl-10 shadow-xs transition-[border-color,box-shadow] focus-visible:border-primary/50 focus-visible:shadow-md focus-visible:shadow-primary/5"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
          className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/40 py-16 text-center"
        >
          <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
            <Coffee className="size-5" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">No menu items found</p>
            <p className="text-xs text-muted-foreground">
              Try a different search or category.
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
    const timer = window.setTimeout(
      () => setJustAdded(false),
      FEEDBACK_HOLD_MS,
    );
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
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={available ? { y: -3, transition: SPRING_SOFT } : undefined}
      whileTap={
        available ? { scale: 0.975, transition: SPRING } : undefined
      }
      transition={{
        duration: DURATION.base,
        ease: EASE_OUT,
        delay: Math.min(index * LIST_STAGGER.step, LIST_STAGGER.max),
      }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-xs transition-[color,background-color,border-color,box-shadow] duration-200",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        available
          ? "border-border hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
          : "cursor-not-allowed border-border opacity-60",
      )}
    >
      <motion.div
        animate={{ scale: justAdded ? 1.02 : 1 }}
        transition={SPRING_SOFT}
        className="flex flex-1 flex-col overflow-hidden"
      >
        {/**
         * The illustrations are 300x400 portraits. `object-cover` in a square box
         * crops the top and bottom, which clears the label band that used to be
         * baked into the artwork and leaves the subject centred.
         */}
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
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
            className="size-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.06] motion-reduce:group-hover:scale-100"
          />

          {/* Warms the bottom of the artwork so the price pill always has a bed. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-linear-to-t from-foreground/45 via-transparent to-transparent"
          />

          {/* A single sweep of light across the tile on hover. Decorative only. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-primary-foreground/20 to-transparent transition-transform duration-500 group-hover:translate-x-full motion-reduce:hidden"
          />

          <span className="absolute bottom-2 left-2 rounded-full bg-card/95 px-2.5 py-1 text-xs font-bold text-primary shadow-sm backdrop-blur">
            {formatIDR(product.price)}
          </span>

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
              <Badge className="bg-primary text-primary-foreground tabular-nums shadow-sm ring-2 ring-card">
                {inCart}
              </Badge>
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

        <div className="flex flex-1 items-start justify-between gap-2 p-3">
          <p className="text-sm leading-snug font-semibold text-balance">
            {product.name}
          </p>
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Plus className="size-3.5" aria-hidden />
          </span>
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
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl bg-foreground/15 backdrop-blur-[1px]"
          >
            <motion.span
              initial={{ scale: 0.5, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={SPRING}
              className="grid size-10 place-items-center rounded-full bg-success text-success-foreground shadow-lg ring-4 ring-success/20"
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
        "relative inline-flex min-h-10 items-center gap-1.5 overflow-hidden rounded-full border px-4 text-sm font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        active
          ? "border-transparent text-primary-foreground"
          : "border-border bg-card/80 text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {/*
        One shared layoutId: the pill physically slides between chips instead of
        the new chip mounting its own highlight.
      */}
      {active ? (
        <motion.span
          layoutId="pos-category-pill"
          className="absolute inset-0 rounded-full bg-primary shadow-sm"
          transition={SPRING}
          aria-hidden
        />
      ) : null}
      <span className="relative z-10">{label}</span>
      {typeof count === "number" ? (
        <span
          className={cn(
            "relative z-10 text-[11px] tabular-nums",
            active ? "text-primary-foreground/80" : "opacity-60",
          )}
        >
          {count}
        </span>
      ) : null}
    </motion.button>
  );
}
