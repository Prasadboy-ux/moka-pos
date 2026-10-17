"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  Check,
  CreditCard,
  Loader2,
  QrCode,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/format";
import { getRepositories } from "@/lib/repositories";
import {
  PAYMENT_LABEL,
  TAX_RATE_DEFAULT,
  type Order,
  type PaymentMethod,
} from "@/types/pos";
import type { CartLine, CartTotals } from "@/store/useCartStore";

const METHODS = [
  { value: "cash" as const, icon: Banknote },
  { value: "qris" as const, icon: QrCode },
  { value: "debit" as const, icon: Wallet },
  { value: "credit" as const, icon: CreditCard },
];

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: CartLine[];
  totals: CartTotals;
  cashierId: string;
  cashierName: string;
  onCompleted: (order: Order) => void;
}

/**
 * The dialog shell stays mounted so the open state is controlled, but the body
 * only mounts while open. That gives each checkout a clean set of state without
 * resetting it from an effect, which would cause a cascading render.
 */
export function CheckoutDialog(props: CheckoutDialogProps) {
  const { open, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <CheckoutBody {...props} /> : null}
    </Dialog>
  );
}

function CheckoutBody({
  onOpenChange,
  lines,
  totals,
  cashierId,
  cashierName,
  onCompleted,
}: CheckoutDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashValue = Number(cashGiven.replace(/\D/g, ""));

  const change = useMemo(
    () => (cashValue >= totals.total ? cashValue - totals.total : 0),
    [cashValue, totals.total],
  );

  const shortfall = useMemo(
    () => (cashValue < totals.total ? totals.total - cashValue : 0),
    [cashValue, totals.total],
  );

  // The next few clean notes above the total.
  const quickAmounts = useMemo(() => {
    const steps = [10_000, 20_000, 50_000, 100_000];
    const suggestions = new Set<number>();
    for (const step of steps) {
      const rounded = Math.ceil(totals.total / step) * step;
      if (rounded >= totals.total) suggestions.add(rounded);
    }
    return [...suggestions].sort((a, b) => a - b).slice(0, 4);
  }, [totals.total]);

  const canSubmit =
    !pending && lines.length > 0 && (method !== "cash" || cashValue >= totals.total);

  async function handleConfirm() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);

    try {
      const paidAmount = method === "cash" ? cashValue : totals.total;

      /**
       * Totals are recomputed inside the repository from the products it reads,
       * so the receipt reflects what was actually charged rather than what the
       * cart believed when it was drawn.
       */
      const { order } = await getRepositories().orders.create({
        lines: lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
        })),
        paymentMethod: method,
        paidAmount,
        cashier: { id: cashierId, name: cashierName },
      });

      onCompleted(order);
    } catch (cause) {
      // Stock can run out between the grid and this click, and the repository
      // is the only layer that knows the real levels.
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the order. Check the connection and retry.",
      );
      setPending(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Complete payment</DialogTitle>
        <DialogDescription>
          {formatIDR(totals.total)} ·{" "}
          {lines.reduce((n, l) => n + l.qty, 0)} items
        </DialogDescription>
      </DialogHeader>

      <Tabs
        value={method}
        onValueChange={(v) => setMethod(v as PaymentMethod)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-4">
          {METHODS.map((m) => {
            const Icon = m.icon;
            return (
              <TabsTrigger key={m.value} value={m.value} className="gap-1.5">
                <Icon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{PAYMENT_LABEL[m.value]}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="space-y-4">
        {method === "cash" ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cash-given">Cash received</Label>
              {/*
                No autoFocus here. This dialog opens on a tablet at the till,
                and focusing the field raises the software keyboard over the
                cart on the way to typing a cash amount — the opposite of what
                a cashier wants at that moment.
              */}
              <Input
                id="cash-given"
                name="cash-received"
                inputMode="numeric"
                placeholder="e.g. 50000…"
                autoComplete="off"
                value={cashGiven}
                onChange={(e) => setCashGiven(e.target.value)}
                className="text-lg font-semibold tabular-nums"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant="outline"
                  /* h-11 rather than size="sm": quick tender is a one-tap
                     substitute for typing an amount, so it needs a thumb-sized
                     hit area. */
                  className="h-11 tabular-nums"
                  onClick={() => setCashGiven(String(amount))}
                >
                  {formatIDR(amount)}
                </Button>
              ))}
            </div>

            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  {shortfall > 0 ? "Still due" : "Change"}
                </span>
                <span
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    shortfall > 0 ? "text-destructive" : "text-primary",
                  )}
                >
                  {shortfall > 0
                    ? formatIDR(shortfall)
                    : formatIDR(change)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-muted/40 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {method === "qris"
                ? "Scan the QRIS code on the customer terminal to complete this payment."
                : `Insert the card and follow the terminal prompt for ${PAYMENT_LABEL[method]}.`}
            </p>
            <p className="mt-3 text-2xl font-bold tabular-nums">
              {formatIDR(totals.total)}
            </p>
          </div>
        )}

        <dl className="space-y-1.5 rounded-xl border p-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatIDR(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>Tax PPN {Math.round(TAX_RATE_DEFAULT * 100)}%</dt>
            <dd className="tabular-nums">{formatIDR(totals.taxAmount)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatIDR(totals.total)}</dd>
          </div>
        </dl>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={!canSubmit}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving...
            </>
          ) : (
            <>
              <Check className="size-4" aria-hidden />
              Complete sale
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}