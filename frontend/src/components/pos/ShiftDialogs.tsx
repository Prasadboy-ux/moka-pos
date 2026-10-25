"use client";

import { useState } from "react";
import { Banknote, Check, Loader2, Scale } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
import { DURATION, EASE_OUT } from "@/lib/motion";
import { formatIDR, formatDateTime } from "@/lib/format";
import { getRepositories } from "@/lib/repositories";
import type { Shift } from "@/types/pos";

/** Digits only, whole rupiah — the same rule the server enforces. */
function readAmount(raw: string): number {
  return Number(raw.replace(/\D/g, "")) || 0;
}

function useFormError() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function failed(cause: unknown): void {
    setError(
      cause instanceof Error
        ? cause.message
        : "Something went wrong. Please try again.",
    );
    setPending(false);
  }

  return { error, setError, pending, setPending, failed };
}

interface OpenShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashier: { id: string; name: string };
  onOpened: () => void;
}

/**
 * Opens the till. Controlled like CheckoutDialog: the shell stays mounted and
 * the body only exists while open, so every attempt starts with clean state.
 *
 * No autoFocus on the amount — this opens on a tablet at the till and focusing
 * would raise the software keyboard over the dialog's own buttons.
 */
export function OpenShiftDialog({
  open,
  onOpenChange,
  cashier,
  onOpened,
}: OpenShiftDialogProps) {
  const [float, setFloat] = useState("");
  const { error, setError, pending, setPending, failed } = useFormError();

  const value = readAmount(float);

  async function handleOpen() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      await getRepositories().shifts.open({
        cashier,
        openingFloat: value,
      });
      setFloat("");
      onOpened();
    } catch (cause) {
      failed(cause);
    }
  }

  function handleDismiss() {
    setError(null);
    setFloat("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else handleDismiss();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open a shift</DialogTitle>
          <DialogDescription>
            Selling starts once your shift is open. Count the cash in the
            drawer first — the drawer is reconciled against this amount when
            you close.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="opening-float">Opening float</Label>
          <Input
            id="opening-float"
            inputMode="numeric"
            placeholder="e.g. 500000…"
            autoComplete="off"
            value={float}
            onChange={(e) => setFloat(e.target.value)}
            className="text-lg font-semibold tabular-nums"
          />
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatIDR(value)}
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleDismiss}>
            Cancel
          </Button>
          <Button type="button" onClick={handleOpen} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Open shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CloseShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift;
  onClosed: (shift: Shift) => void;
}

/**
 * Closes the till, then shows the server's reconciliation before dismissing.
 *
 * The result phase is the point of the whole feature: the cashier sees what the
 * drawer was expected to hold and how far the count was off, and the variance
 * comes back from the server — the client never does the arithmetic it is
 * judging anyone on.
 */
export function CloseShiftDialog({
  open,
  onOpenChange,
  shift,
  onClosed,
}: CloseShiftDialogProps) {
  const [counted, setCounted] = useState("");
  const [result, setResult] = useState<Shift | null>(null);
  const { error, setError, pending, setPending, failed } = useFormError();

  const value = readAmount(counted);
  const variance = result ? (result.variance ?? 0) : 0;

  async function handleClose() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const closed = await getRepositories().shifts.close(shift.id, value);
      setResult(closed);
      setPending(false);
    } catch (cause) {
      failed(cause);
    }
  }

  /** Clears attempt state; tells the screen when a close already happened. */
  function handleDismiss() {
    const closed = result;
    setCounted("");
    setResult(null);
    if (closed) onClosed(closed);
    else onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else handleDismiss();
      }}
    >
      {/**
       * One content shell hosts both phases; the two-step flow swaps inside an
       * AnimatePresence so the count step fades out before the reconciliation
       * fades in, instead of two separate dialogs blinking in and out.
       */}
      <DialogContent className="sm:max-w-md">
        <AnimatePresence initial={false} mode="wait">
          {result ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
              className="grid gap-4"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {variance === 0 ? (
                    <Check className="size-5 text-success" aria-hidden />
                  ) : (
                    <Scale className="size-5 text-warning" aria-hidden />
                  )}
                  {variance === 0 ? "Drawer balanced" : "Drawer not balanced"}
                </DialogTitle>
                <DialogDescription>
                  Shift closed at {formatDateTime(result.closedAt ?? new Date())}.
                </DialogDescription>
              </DialogHeader>

              <dl className="divide-y rounded-lg border text-sm">
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-muted-foreground">Opening float</dt>
                  <dd className="tabular-nums">{formatIDR(result.openingFloat)}</dd>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-muted-foreground">Cash sales</dt>
                  <dd className="tabular-nums">
                    {formatIDR(result.cashSales ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-muted-foreground">Expected in drawer</dt>
                  <dd className="font-medium tabular-nums">
                    {formatIDR(result.expectedCash ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-muted-foreground">Counted</dt>
                  <dd className="tabular-nums">
                    {formatIDR(result.closingCounted ?? 0)}
                  </dd>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-muted-foreground">Variance</dt>
                  <dd
                    className={
                      variance === 0
                        ? "font-semibold text-success tabular-nums"
                        : "font-semibold text-destructive tabular-nums"
                    }
                  >
                    {variance > 0 ? "+" : ""}
                    {formatIDR(variance)}
                  </dd>
                </div>
              </dl>

              <DialogFooter>
                <Button type="button" onClick={handleDismiss}>
                  <Banknote className="size-4" aria-hidden />
                  Done
                </Button>
              </DialogFooter>
            </motion.div>
          ) : (
            <motion.div
              key="count"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
              className="grid gap-4"
            >
              <DialogHeader>
                <DialogTitle>Close shift</DialogTitle>
                <DialogDescription>
                  Count the cash in the drawer, then enter what you counted. Opened{" "}
                  {formatDateTime(shift.openedAt)} with{" "}
                  {formatIDR(shift.openingFloat)}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="counted">Counted cash</Label>
                <Input
                  id="counted"
                  inputMode="numeric"
                  placeholder="e.g. 592400…"
                  autoComplete="off"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  className="text-lg font-semibold tabular-nums"
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleDismiss}>
                  Keep open
                </Button>
                <Button type="button" onClick={handleClose} disabled={pending}>
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  Close shift
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
