"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import { formatIDR, formatNumber } from "@/lib/format";
import { DURATION, EASE_OUT, pop, SPRING } from "@/lib/motion";
import type { CartLine, CartTotals } from "@/store/useCartStore";

interface CartPanelProps {
  lines: CartLine[];
  /** Units still addable per product, counting the rest of the cart's claims. */
  limits: Map<string, number | null>;
  totals: CartTotals;
  taxRate: number;
  onSetQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
}

export function CartPanel({
  lines,
  limits,
  totals,
  taxRate,
  onSetQty,
  onRemove,
  onClear,
  onCheckout,
}: CartPanelProps) {
  /**
   * Clearing is confirmed rather than immediate. One stray tap next to the
   * quantity steppers throws away a dozen-line order, and rebuilding it means
   * re-tapping every tile — which is why this is not a bare button.
   */
  const [confirmClear, setConfirmClear] = React.useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2
          data-cart-drop
          className="scroll-mt-4 text-sm font-semibold tracking-tight"
        >
          Current order
        </h2>
        {lines.length > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="flex min-h-10 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Clear
          </button>
        ) : null}
      </div>

      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {lines.length === 0 ? (
          <motion.div
            variants={pop}
            initial="hidden"
            animate="show"
            className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <ShoppingCart className="size-5" aria-hidden />
            </div>
            <p className="text-sm font-medium">Order is empty</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tap a menu item to start the order.
            </p>
          </motion.div>
        ) : (
          <ul className="[&>li:last-child>div]:border-0">
            <AnimatePresence initial={false} mode="popLayout">
              {lines.map((line) => {
                const limit = limits.get(line.productId) ?? null;
                const atLimit = limit !== null && line.qty >= limit;

                return (
                  <motion.li
                    key={line.productId}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{
                      layout: SPRING,
                      height: { duration: DURATION.base, ease: EASE_OUT },
                      opacity: { duration: DURATION.fast, ease: EASE_OUT },
                    }}
                    className="overflow-hidden"
                  >
                  <div className="border-b px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatIDR(line.price)} each
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatIDR(line.price * line.qty)}
                    </p>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        /* 40px rather than the 28px it started at: these are
                           pressed repeatedly during a rush, by finger. */
                        className="size-10"
                        aria-label={`Decrease ${line.name}`}
                        onClick={() => onSetQty(line.productId, line.qty - 1)}
                      >
                        <Minus className="size-3.5" aria-hidden />
                      </Button>
                      <span
                        data-cart-qty={line.productId}
                        className="w-8 text-center text-sm font-semibold tabular-nums"
                      >
                        <motion.span
                          key={line.qty}
                          initial={{ scale: 1.35, opacity: 0.6 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={SPRING}
                          className="inline-block"
                        >
                          {line.qty}
                        </motion.span>
                      </span>
                      {/*
                        Disabled rather than clamped silently. A stepper that
                        refuses to move and gives no reason reads as a broken
                        till; the remaining-count note below is what turns it into
                        a fact about stock.
                      */}
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-10"
                        aria-label={`Increase ${line.name}`}
                        aria-describedby={atLimit ? `limit-${line.productId}` : undefined}
                        disabled={atLimit}
                        onClick={() => onSetQty(line.productId, line.qty + 1)}
                      >
                        <Plus className="size-3.5" aria-hidden />
                      </Button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemove(line.productId)}
                      aria-label={`Remove ${line.name}`}
                      className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>

                  {atLimit ? (
                    <p
                      id={`limit-${line.productId}`}
                      className="mt-1.5 text-[11px] font-medium text-muted-foreground"
                    >
                      All remaining stock is in this order
                    </p>
                  ) : null}
                  </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <Separator />

      <div className="space-y-2 p-4">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Subtotal ({formatNumber(totals.itemCount)}{" "}
            {totals.itemCount === 1 ? "item" : "items"})
          </span>
          <span className="tabular-nums">{formatIDR(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Tax PPN {Math.round(taxRate * 100)}%</span>
          <span className="tabular-nums">{formatIDR(totals.taxAmount)}</span>
        </div>
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm font-semibold">Total</span>
          <AnimatedNumber
            value={totals.total}
            animateOnMount={false}
            className="inline-block text-xl font-bold tabular-nums"
          />
        </div>

        {/* The most-pressed control in the app, so it gets a thumb-sized hit
            area rather than the standard button height. */}
        <Button
          size="lg"
          className="mt-2 h-12 w-full text-base"
          disabled={lines.length === 0}
          onClick={onCheckout}
        >
          Charge {formatIDR(totals.total)}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear this order?"
        description={`${formatNumber(totals.itemCount)} ${
          totals.itemCount === 1 ? "item" : "items"
        } worth ${formatIDR(totals.total)} will be removed from the cart.`}
        confirmLabel="Clear order"
        destructive
        onConfirm={async () => {
          onClear();
        }}
      />
    </div>
  );
}