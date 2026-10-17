"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
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
import { useToast } from "@/components/ui/toast";
import { getRepositories } from "@/lib/repositories";
import type { Category } from "@/types/pos";

/**
 * Category list with inline add, rename, reorder, and delete.
 *
 * Reorder matters more than it looks: the category order is what the POS grid
 * and every category filter render in, so it is managed here rather than being
 * implied by an editable `sortOrder` number.
 */

const schema = z.object({ name: z.string().trim().min(2, "Name is too short") });
type Values = z.infer<typeof schema>;

interface CategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  /** How many products sit in each category, to warn before a delete. */
  usage: Map<string, number>;
  onChanged: () => void;
}

export function CategoryManagerDialog({
  open,
  onOpenChange,
  categories,
  usage,
  onChanged,
}: CategoryManagerDialogProps) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  async function run(action: () => Promise<unknown>, successTitle: string) {
    setPending(true);
    try {
      await action();
      toast({ title: successTitle, variant: "success" });
      onChanged();
    } catch (cause) {
      toast({
        title: "That did not work",
        description: cause instanceof Error ? cause.message : "Please try again.",
        variant: "destructive",
      });
      throw cause;
    } finally {
      setPending(false);
    }
  }

  const onCreate = handleSubmit(async (values) => {
    await run(
      () => getRepositories().categories.create({ name: values.name }),
      "Category added",
    );
    reset();
  });

  async function onRename(id: string, currentName: string) {
    const next = window.prompt("Category name", currentName);
    if (next === null) return;

    const trimmed = next.trim();
    if (trimmed === currentName || trimmed.length < 2) return;

    try {
      await run(
        () => getRepositories().categories.update(id, { name: trimmed }),
        "Category renamed",
      );
    } catch {
      // Already surfaced by run().
    }
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    try {
      await run(() => getRepositories().categories.remove(id), "Category removed");
    } catch {
      // Already surfaced by run().
    } finally {
      setDeletingId(null);
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const ordered = [...categories];
    const index = ordered.findIndex((category) => category.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= ordered.length) return;

    const [moved] = ordered.splice(index, 1);
    if (!moved) return;
    ordered.splice(target, 0, moved);

    try {
      await run(
        () =>
          getRepositories().categories.reorder(ordered.map((category) => category.id)),
        "Order updated",
      );
    } catch {
      // Already surfaced by run().
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>
            The order here is the order shown on the POS grid and in every filter.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {categories.map((category, index) => {
            const count = usage.get(category.id) ?? 0;

            return (
              <li
                key={category.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{category.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {count} {count === 1 ? "product" : "products"}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${category.name} up`}
                  disabled={index === 0 || pending}
                  onClick={() => void move(category.id, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${category.name} down`}
                  disabled={index === categories.length - 1 || pending}
                  onClick={() => void move(category.id, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void onRename(category.id, category.name)}
                  disabled={pending}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${category.name}`}
                  disabled={pending || count > 0}
                  title={
                    count > 0 ? "Move its products to another category first" : undefined
                  }
                  onClick={() => void onDelete(category.id)}
                >
                  {deletingId === category.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                </Button>
              </li>
            );
          })}
        </ul>

        <form onSubmit={onCreate} className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-category">New category</Label>
            <Input
              id="new-category"
              placeholder="e.g. Seasonal"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>
          <Button type="submit" disabled={pending}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}