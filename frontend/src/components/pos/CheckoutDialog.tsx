"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Banknote,
  Check,
  CreditCard,
  Loader2,
  QrCode,
  Wallet,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { newIdempotencyKey } from "@/lib/idempotency";
import { DURATION, EASE_OUT, collapse, shakeX, SPRING } from "@/lib/motion";
import { getRepositories } from "@/lib/repositories";
import {
  PAYMENT_LABEL,
  normalisePhone,
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
  /** Read for the tax label. The constant would drift from the cart's own rate. */
  taxRate: number;
  cashierId: string;
  cashierName: string;
  onCompleted: (order: Order) => void;
  /**
   * Called when the server refuses the sale with `409 no-open-shift` — the
   * shift was closed while this checkout was open. The screen drops back to
   * the shift gate; without this the dialog would sit on an error the cashier
   * cannot act on.
   */
  onShiftRequired?: () => void;
}

/**
 * The dialog shell stays mounted so the open state is controlled, and the
 * body mounts through the content slot the moment the dialog opens. That gives
 * each checkout a fresh set of state — a new idempotency key, empty fields —
 * without resetting it from an effect, while the shell keeps rendering until
 * the exit animation finishes.
 */
export function CheckoutDialog(props: CheckoutDialogProps) {
  const { open, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <CheckoutBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function CheckoutBody({
  onOpenChange,
  lines,
  totals,
  taxRate,
  cashierId,
  cashierName,
  onCompleted,
  onShiftRequired,
}: CheckoutDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One key per opened checkout, not per HTTP attempt. If the request reaches
   * the server but the response is lost, tapping Complete sale again replays the
   * receipt instead of charging the customer a second time.
   */
  const [idempotencyKey] = useState(newIdempotencyKey);

  const [withCustomer, setWithCustomer] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

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

  /**
   * Live under the phone field only once something has been typed: an empty
   * optional field is not invalid, and showing a red error on an untouched
   * control teaches the cashier to ignore red.
   */
  const phoneTyped = withCustomer && customerPhone.trim() !== "";
  const phonePreview = useMemo(() => {
    if (!phoneTyped) return null;
    return normalisePhone(customerPhone);
  }, [phoneTyped, customerPhone]);
  const phoneInvalid = phoneTyped && phonePreview === null;

  const canSubmit =
    !pending &&
    lines.length > 0 &&
    (method !== "cash" || cashValue >= totals.total);

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
        idempotencyKey,
        /**
         * The repository normalises this and drops it if the number is unusable,
         * so a half-typed field costs the sale nothing — it just means a walk-in
         * order, which is the common case anyway.
         */
        customer: withCustomer
          ? {
              name: customerName,
              phone: customerPhone,
              email: customerEmail || null,
            }
          : null,
      });

      onCompleted(order);
    } catch (cause) {
      const failure = cause as {
        message?: string;
        reason?: string;
      };

      /**
       * An admin can change a price while a cart is still open. The till
       * recomputes the total from current menu prices, so the sale fails as
       * "short" even though the cashier collected exactly what the dialog
       * showed a minute ago. Naming that explanation next to the shortfall —
       * copy from the API, which owns the sentence — spares the cashier from
       * suspecting they miscounted the cash.
       */
      if (failure.message?.includes("short of the total")) {
        setError(
          `${failure.message} The menu has changed since this cart was opened, and the till charges today's prices. Start the order again so the amounts line up.`,
        );
      } else {
        // Stock can run out between the grid and this click, and the
        // repository is the only layer that knows the real levels.
        setError(
          failure.message ??
            "Could not save the order. Check the connection and retry.",
        );
      }
      setPending(false);

      /**
       * Checked structurally rather than by importing the repository's error
       * class: screens only ever see a thrown Error, and the refusal code in
       * its `reason` is what says "this is a shift problem, not a sale problem".
       */
      if ((cause as { reason?: string })?.reason === "no-open-shift") {
        onShiftRequired?.();
      }
    }
  }

  return (
    <>
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
                {/*
                  `sr-only` rather than `hidden sm:inline`: display:none removes
                  the text from the accessibility tree, so a phone-width dialog
                  would announce four icon-only tabs with no names.
                */}
                <span className="hidden sm:inline">{PAYMENT_LABEL[m.value]}</span>
                <span className="sr-only sm:hidden">{PAYMENT_LABEL[m.value]}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="space-y-4">
        <AnimatePresence initial={false} mode="wait">
          {method === "cash" ? (
            <motion.div
              key="cash"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: DURATION.swap, ease: EASE_OUT }}
              className="space-y-3"
            >
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
                {/*
                  A polite live region: the cashier taps a quick-tender button and
                  needs the new "Still due" / "Change" figure announced without
                  stealing focus mid-sale.
                */}
                <div
                  aria-live="polite"
                  className="flex items-baseline justify-between"
                >
                  <span className="text-sm text-muted-foreground">
                    {shortfall > 0 ? "Still due" : "Change"}
                  </span>
                  <motion.span
                    key={shortfall > 0 ? `due-${shortfall}` : `change-${change}`}
                    initial={{ scale: 1.08, opacity: 0.7 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={SPRING}
                    className={cn(
                      "inline-block text-xl font-bold tabular-nums",
                      shortfall > 0 ? "text-destructive" : "text-primary",
                    )}
                  >
                    {shortfall > 0
                      ? formatIDR(shortfall)
                      : formatIDR(change)}
                  </motion.span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="other"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: DURATION.swap, ease: EASE_OUT }}
              className="rounded-xl border bg-muted/40 p-6 text-center"
            >
              <p className="text-sm text-muted-foreground">
                {method === "qris"
                  ? "Scan the QRIS code on the customer terminal to complete this payment."
                  : `Insert the card and follow the terminal prompt for ${PAYMENT_LABEL[method]}.`}
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums">
                {formatIDR(totals.total)}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <dl className="space-y-1.5 rounded-xl border p-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatIDR(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            {/* The store's rate, not the constant: the two used to be read from
                different places and would quietly disagree the day the rate
                stops being 10%. */}
            <dt>Tax PPN {Math.round(taxRate * 100)}%</dt>
            <dd className="tabular-nums">{formatIDR(totals.taxAmount)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatIDR(totals.total)}</dd>
          </div>
        </dl>

        {/*
          Collapsed by default, and it stays that way on purpose: most sales are
          a walk-in, so a phone field sitting on every checkout would be a field
          that never gets filled in. It is here for the customer who asks for a
          receipt to be sent.
        */}
        <div className="rounded-xl border">
          <button
            type="button"
            onClick={() => setWithCustomer((value) => !value)}
            aria-expanded={withCustomer}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-offset-2"
          >
            Customer details
            <span className="text-xs font-normal text-muted-foreground">
              {withCustomer ? "Hide" : "Optional"}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {withCustomer ? (
              <motion.div
                key="customer-details"
                variants={collapse}
                initial="hidden"
                animate="show"
                className="overflow-hidden"
              >
                <div className="space-y-3 border-t px-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer-name">Name</Label>
                    <Input
                      id="customer-name"
                      name="customer-name"
                      autoComplete="name"
                      placeholder="e.g. Dewi Lestari"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer-phone">WhatsApp number</Label>
                    <Input
                      id="customer-phone"
                      name="customer-phone"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="08xx xxxx xxxx"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      aria-invalid={phoneInvalid}
                      aria-describedby={
                        phoneInvalid
                          ? "customer-phone-error"
                          : phonePreview
                            ? "customer-phone-hint"
                            : undefined
                      }
                    />
                    {phoneInvalid ? (
                      <p id="customer-phone-error" className="text-xs text-destructive">
                        That number is not a valid Indonesian mobile number. The sale
                        will still go through without it.
                      </p>
                    ) : phonePreview ? (
                      <p id="customer-phone-hint" className="text-xs text-muted-foreground">
                        The receipt will be addressed to {phonePreview}.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer-email">Email</Label>
                    <Input
                      id="customer-email"
                      name="customer-email"
                      type="email"
                      autoComplete="email"
                      placeholder="Optional"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false}>
          {error ? (
            <motion.div
              key="checkout-error"
              variants={collapse}
              initial="hidden"
              animate="show"
              className="overflow-hidden"
            >
              <motion.div
                initial={{ x: 0 }}
                animate={{ x: shakeX }}
                transition={{ duration: 0.32, ease: EASE_OUT }}
              >
                <Alert
                  variant="destructive"
                  className="border-destructive/40 bg-destructive/5"
                >
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {method === "cash" && shortfall > 0 && !pending ? (
          <p id="checkout-submit-hint" className="text-xs text-muted-foreground">
            Enter at least {formatIDR(shortfall)} more to complete this sale.
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
        <Button
          onClick={handleConfirm}
          disabled={!canSubmit}
          aria-describedby={
            method === "cash" && shortfall > 0 && !pending
              ? "checkout-submit-hint"
              : undefined
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            {pending ? (
              <motion.span
                key="pending"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="inline-flex items-center gap-2"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving…
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="inline-flex items-center gap-2"
              >
                <Check className="size-4" aria-hidden />
                Complete sale
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </DialogFooter>
    </>
  );
}