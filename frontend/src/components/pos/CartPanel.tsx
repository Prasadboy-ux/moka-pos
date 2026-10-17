"use client";

import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatIDR, formatNumber } from "@/lib/format";
import type { CartLine } from "@/store/useCartStore";
import type { CartTotals } from "@/store/useCartStore";

interface CartPanelProps {
  lines: CartLine[];
  totals: CartTotals;
  taxRate: number;
  onSetQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
}

export function CartPanel({
  lines,
  totals,
  taxRate,
  onSetQty,
  onRemove,
  onClear,
  onCheckout,
}: CartPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Current order</h2>
        {lines.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
          >
            Clear
          </button>
        ) : null}
      </div>

      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <ShoppingCart className="size-5" aria-hidden />
            </div>
            <p className="text-sm font-medium">Order is empty</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tap a menu item to start the order.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => (
              <li key={line.productId} className="px-4 py-3">
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
                      className="size-7"
                      aria-label={`Decrease ${line.name}`}
                      onClick={() => onSetQty(line.productId, line.qty - 1)}
                    >
                      <Minus className="size-3.5" aria-hidden />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">
                      {line.qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      aria-label={`Increase ${line.name}`}
                      onClick={() => onSetQty(line.productId, line.qty + 1)}
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </Button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemove(line.productId)}
                    aria-label={`Remove ${line.name}`}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
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
          <span className="text-xl font-bold tabular-nums">
            {formatIDR(totals.total)}
          </span>
        </div>

        <Button
          size="lg"
          className="mt-2 w-full"
          disabled={lines.length === 0}
          onClick={onCheckout}
        >
          Charge {formatIDR(totals.total)}
        </Button>
      </div>
    </div>
  );
}