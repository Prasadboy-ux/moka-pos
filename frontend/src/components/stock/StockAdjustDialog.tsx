"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, TriangleAlert } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { getRepositories } from "@/lib/repositories";
import type { StockAdjustInput } from "@/lib/repositories/types";
import { useAuthStore } from "@/store/useAuthStore";
import { formatNumber } from "@/lib/format";
import type { Ingredient, MovementType, Product } from "@/types/pos";

/**
 * Records a stock movement.
 *
 * The reason is chosen rather than typed freeform, and the note is optional:
 * "waste" and "adjustment" are decisions someone will need to explain later, so
 * the ledger needs them separated. Purchases and waste derive their sign from
 * the reason; a correction keeps the sign the admin typed, because the whole
 * point of a correction is that the recorded level can be wrong in either
 * direction.
 */

type Reason = Exclude<MovementType, "sale">;

const REASONS: Array<{
  value: Reason;
  label: string;
  hint: string;
}> = [
  {
    value: "purchase",
    label: "Purchase",
    hint: "Stock received from a supplier.",
  },
  {
    value: "waste",
    label: "Waste",
    hint: "Spilled, expired, or dropped.",
  },
  {
    value: "adjustment",
    label: "Correction",
    hint: "A recount disagreed with the recorded level.",
  },
];

const schema = z.object({
  target: z.enum(["ingredient", "product"]),
  targetId: z.string().min(1),
  reason: z.enum(["purchase", "waste", "adjustment"]),
  qty: z
    .number({ error: "Enter a quantity" })
    .refine((value) => value !== 0, "Quantity cannot be zero"),
  note: z.string().max(240),
});

type Values = z.infer<typeof schema>;

interface StockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { kind: "ingredient"; record: Ingredient } | { kind: "product"; record: Product } | null;
  onDone: () => void;
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  target,
  onDone,
}: StockAdjustDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && target ? <AdjustBody target={target} onOpenChange={onOpenChange} onDone={onDone} /> : null}
    </Dialog>
  );
}

function AdjustBody({
  target,
  onOpenChange,
  onDone,
}: {
  target: NonNullable<StockAdjustDialogProps["target"]>;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const user = useAuthStore((state) => state.session?.user ?? null);
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const current =
    target.kind === "ingredient" ? target.record.stock : (target.record.stock ?? 0);
  const unit = target.kind === "ingredient" ? target.record.unit : "pcs";
  const minStock = target.kind === "ingredient" ? target.record.minStock : (target.record.minStock ?? 0);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      target: target.kind,
      targetId: target.record.id,
      reason: "purchase",
      qty: Number.NaN,
      note: "",
    },
  });

  const [reason, qty] = useWatch({ control, name: ["reason", "qty"] });

  const amount = Number.isFinite(qty) ? qty : 0;

  /**
   * A correction keeps its sign. The old UI showed both an addition and a
   * removal for every correction, then sent the positive one — so correcting a
   * count downwards silently added stock. One signed delta and one projection is
   * the only reading that matches what gets saved.
   */
  const delta =
    reason === "purchase"
      ? Math.abs(amount)
      : reason === "waste"
        ? -Math.abs(amount)
        : amount;

  const nextLevel = current + delta;
  const wouldWarn = nextLevel < minStock;
  const projectionText = `${formatNumber(nextLevel)} ${unit}`;

  async function onSubmit(values: Values) {
    setPending(true);
    setFormError(null);

    try {
      if (!user) {
        setFormError("Sign in again before changing stock.");
        return;
      }

      const payload: StockAdjustInput = {
        target: values.target,
        targetId: values.targetId,
        type: values.reason,
        qty: delta,
        note:
          values.note.trim() ||
          REASONS.find((r) => r.value === values.reason)?.label ||
          "",
        actor: { id: user.id, name: user.name },
      };

      await getRepositories().stock.adjust(payload);

      toast({
        title: target.kind === "ingredient" ? "Stock updated" : "Product stock updated",
        description: `${target.record.name} is now ${formatNumber(
          current + payload.qty,
        )} ${unit}.`,
        variant: "success",
      });

      onOpenChange(false);
      onDone();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not record the movement.");
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription>
          {target.record.name} — currently {formatNumber(current)} {unit}.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="adjust-reason">Reason</Label>
          <Select
            value={reason}
            onValueChange={(value) => setValue("reason", value as Reason, { shouldValidate: true })}
          >
            <SelectTrigger id="adjust-reason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {REASONS.find((r) => r.value === reason)?.hint}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="adjust-qty">
            {reason === "purchase"
              ? `Quantity added (${unit})`
              : reason === "waste"
                ? `Quantity removed (${unit})`
                : `Change (${unit})`}
          </Label>
          <Input
            id="adjust-qty"
            type="number"
            inputMode="decimal"
            min={reason === "adjustment" ? undefined : 0}
            step="any"
            placeholder={reason === "adjustment" ? "e.g. -3…" : "0"}
            aria-invalid={Boolean(errors.qty)}
            aria-describedby={
              reason === "adjustment" ? "adjust-qty-hint" : undefined
            }
            {...register("qty", { valueAsNumber: true })}
          />
          {reason === "adjustment" ? (
            <p id="adjust-qty-hint" className="text-xs text-muted-foreground">
              Use a positive number to add stock, or a negative number to remove
              it.
            </p>
          ) : null}
          <FieldError message={errors.qty?.message} />

          {delta !== 0 ? (
            <div
              className={
                wouldWarn
                  ? "flex items-start gap-1.5 text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {wouldWarn ? (
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              ) : null}
              <span>
                New level: {projectionText}.
                {wouldWarn
                  ? ` That is below the reorder point of ${formatNumber(minStock)}.`
                  : ""}
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="adjust-note">Note (optional)</Label>
          <Textarea
            id="adjust-note"
            rows={2}
            placeholder="e.g. Delivery from supplier, invoice 2041"
            {...register("note")}
          />
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Record movement
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}