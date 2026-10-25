"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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
import { useToast } from "@/components/ui/toast";
import { useController } from "react-hook-form";
import { getRepositories } from "@/lib/repositories";
import { formatNumber } from "@/lib/format";
import type { Ingredient, Unit } from "@/types/pos";

/**
 * Create and edit for an ingredient.
 *
 * Stock lives elsewhere: a new ingredient starts empty and every level change
 * afterwards goes through the adjust dialog, so every unit on hand always has a
 * ledger entry explaining it. This form therefore edits only the record itself —
 * the name, unit, reorder threshold, and unit cost.
 *
 * The unit of `costPerUnit` is rupiah per grain, not per bag: a 250 g bag at
 * Rp 95,000 is 380 per gram. The description spells this out because it is the
 * single easiest field in the inventory to mis-enter.
 */

const ingredientSchema = z.object({
  name: z.string().trim().min(2, "Name is too short"),
  unit: z.enum(["gram", "ml", "pcs"]),
  minStock: z
    .number({ error: "Enter a quantity" })
    .min(0, "Cannot be negative"),
  costPerUnit: z
    .number({ error: "Enter a price" })
    .int("Whole rupiahs only")
    .min(0, "Cannot be negative"),
});

type IngredientFormValues = z.infer<typeof ingredientSchema>;

interface IngredientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates a new ingredient. */
  ingredient: Ingredient | null;
  onSaved: () => void;
}

const UNITS: Unit[] = ["gram", "ml", "pcs"];

export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
  onSaved,
}: IngredientDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <IngredientDialogBody
          ingredient={ingredient}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

function IngredientDialogBody({
  ingredient,
  onOpenChange,
  onSaved,
}: Omit<IngredientDialogProps, "open">) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: ingredient
      ? {
          name: ingredient.name,
          unit: ingredient.unit,
          minStock: ingredient.minStock,
          costPerUnit: ingredient.costPerUnit,
        }
      : { name: "", unit: "gram", minStock: 0, costPerUnit: 0 },
  });

  const unit = useController({ control, name: "unit" });

  async function onSubmit(values: IngredientFormValues) {
    setPending(true);
    setFormError(null);

    try {
      const payload = {
        name: values.name.trim(),
        unit: values.unit,
        minStock: values.minStock,
        costPerUnit: values.costPerUnit,
      };

      const { ingredients } = getRepositories();

      if (ingredient) {
        await ingredients.update(ingredient.id, payload);
      } else {
        await ingredients.create(payload);
      }

      toast({
        title: ingredient ? "Ingredient updated" : "Ingredient created",
        description: ingredient
          ? "Recipes using this ingredient pick up the change immediately."
          : "It starts empty — record the opening stock with a purchase movement.",
        variant: "success",
      });
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Could not save the ingredient.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{ingredient ? "Edit ingredient" : "New ingredient"}</DialogTitle>
        <DialogDescription>
          {ingredient
            ? "Renaming or re-costing does not touch the stock on hand."
            : "A new ingredient starts at zero stock so the ledger can explain every unit on hand."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="ingredient-name">Name</Label>
          <Input
            id="ingredient-name"
            placeholder="e.g. Espresso blend beans"
            autoFocus
            aria-invalid={Boolean(errors.name)}
            {...register("name")}
          />
          {errors.name ? (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ingredient-unit">Unit</Label>
          <Select value={unit.field.value} onValueChange={unit.field.onChange}>
            <SelectTrigger id="ingredient-unit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Recipes express their amounts in this unit, so a change here ripples
            into every recipe that lists it.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ingredient-min-stock">Reorder at</Label>
            <Input
              id="ingredient-min-stock"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              aria-invalid={Boolean(errors.minStock)}
              {...register("minStock", { valueAsNumber: true })}
            />
            {errors.minStock ? (
              <p className="text-xs text-destructive">{errors.minStock.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ingredient-cost">Cost per unit</Label>
            <Input
              id="ingredient-cost"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              aria-invalid={Boolean(errors.costPerUnit)}
              {...register("costPerUnit", { valueAsNumber: true })}
            />
            {errors.costPerUnit ? (
              <p className="text-xs text-destructive">
                {errors.costPerUnit.message}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Cost is rupiah for one {unit.field.value}. Example: a 250 g bag at Rp
          95,000 is {formatNumber(380)} per gram.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {ingredient ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
