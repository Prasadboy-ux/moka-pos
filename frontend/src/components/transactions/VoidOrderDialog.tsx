"use client";

import * as React from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useAuthStore } from "@/store/useAuthStore";
import { getRepositories } from "@/lib/repositories";
import { formatIDR } from "@/lib/format";
import type { Order } from "@/types/pos";

interface VoidOrderDialogProps {
  order: Order | null;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful void so the caller can refresh its list. */
  onVoided: (order: Order, warnings: string[]) => void;
}

/**
 * Reverses a sale, and makes the reason unskippable.
 *
 * A void returns stock and un-sells money, so "why?" is the one field that
 * cannot default to empty: the receipt carries whatever is typed here and the
 * transaction table shows it on the voided row.
 */
export function VoidOrderDialog({
  order,
  onOpenChange,
  onVoided,
}: VoidOrderDialogProps) {
  /**
   * A ref rather than state: a void in flight may outlive the open dialog (a
   * dismiss during the request unmounts the body), and the guard must keep
   * working across that unmount without an effect to reset it.
   */
  const pendingRef = React.useRef(false);

  return (
    <Dialog
      open={Boolean(order)}
      onOpenChange={(next) => {
        if (pendingRef.current) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {order ? (
          <VoidBody
            order={order}
            onOpenChange={onOpenChange}
            onVoided={onVoided}
            onPendingChange={(inFlight) => {
              pendingRef.current = inFlight;
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The body mounts through the content slot while the dialog is open, so every
 * void starts from an empty reason field — nothing from the last void rides
 * along, and no reset effect is needed.
 */
function VoidBody({
  order,
  onOpenChange,
  onVoided,
  onPendingChange,
}: {
  order: Order;
  onOpenChange: (open: boolean) => void;
  onVoided: (order: Order, warnings: string[]) => void;
  onPendingChange: (inFlight: boolean) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const sessionUser = useAuthStore((state) => state.session?.user ?? null);

  const ready = reason.trim().length >= 3;

  async function handleVoid() {
    setPending(true);
    onPendingChange(true);
    try {
      const actor = sessionUser
        ? { id: sessionUser.id, name: sessionUser.name }
        : undefined;

      const result = await getRepositories().orders.void(
        order.id,
        reason.trim(),
        actor,
      );

      onOpenChange(false);
      onVoided(result.order, result.warnings);

      toast({
        title: `${result.order.receiptNo} voided`,
        description:
          result.warnings.length > 0
            ? `Reversal succeeded, but: ${result.warnings[0]}`
            : `Stock restored. ${formatIDR(order.total)} is no longer counted as revenue.`,
        variant: "default",
      });
    } catch (cause) {
      toast({
        title: "That did not work",
        description: cause instanceof Error ? cause.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
      onPendingChange(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-destructive">
          <Ban className="size-4" aria-hidden />
          Void {order.receiptNo}
        </DialogTitle>
        <DialogDescription>
          This reverses the sale: stock is returned and{" "}
          <span className="font-semibold">{formatIDR(order.total)}</span>{" "}
          stops counting as revenue across every report. A closed shift and
          its cash count are not re-run, so reconcile the drawer against the
          ledger when the shift has already been closed.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="void-reason">Why is this being voided?</Label>
        <Textarea
          id="void-reason"
          placeholder="e.g. Customer changed their mind before pickup"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={pending}
          aria-describedby="void-reason-hint"
        />
        <p id="void-reason-hint" className="text-xs text-muted-foreground">
          At least 3 characters. This is printed on the receipt and shown next
          to it in the transaction list.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={pending || !ready}
          onClick={() => void handleVoid()}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Void receipt
        </Button>
      </DialogFooter>
    </>
  );
}
