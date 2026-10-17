"use client";

import * as React from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  useController,
  type Control,
  type FieldArrayWithId,
  type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImageIcon, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { getRepositories } from "@/lib/repositories";
import type { ProductInput } from "@/lib/repositories/types";
import { formatIDR, formatNumber } from "@/lib/format";
import type {
  Category,
  Ingredient,
  Product,
  RecipeItem,
  StockMode,
} from "@/types/pos";

/**
 * Create and edit for a product.
 *
 * The body is mounted only while the dialog is open, so opening it for a
 * different product starts from that product's values rather than carrying the
 * previous edit's state across.
 *
 * Numeric fields use `z.number` with `valueAsNumber` on the input rather than
 * `z.coerce.number`. Coercion makes the schema's input type `unknown`, which in
 * turn forces the form to be typed on the output shape and quietly accepts
 * whatever the DOM produced — an empty box then reaches the model as `NaN`.
 */

const recipeRowSchema = z.object({
  ingredientId: z.string().min(1, "Pick an ingredient"),
  // Recipes use fractions of a gram for tea, so this cannot be a whole number.
  qty: z.number({ error: "Enter a quantity" }).positive("Must be more than 0"),
});

const productSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short"),
    categoryId: z.string().min(1, "Pick a category"),
    price: z
      .number({ error: "Enter a price" })
      .int("Whole rupiahs only")
      .min(0),
    image: z.string().min(1, "Pick an illustration"),
    stockMode: z.enum(["recipe", "direct"]),
    stock: z.number({ error: "Enter a quantity" }).min(0),
    minStock: z.number({ error: "Enter a quantity" }).min(0),
    isActive: z.boolean(),
    recipe: z.array(recipeRowSchema),
  })
  .superRefine((values, ctx) => {
    if (values.stockMode !== "recipe") return;

    if (values.recipe.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["recipe"],
        message: "A made-to-order item needs at least one ingredient",
      });
      return;
    }

    /**
     * Two rows for the same ingredient would decrement it twice within one sale
     * and leave the recipe ambiguous, so it is rejected rather than summed.
     */
    const seen = new Set<string>();
    values.recipe.forEach((row, index) => {
      if (seen.has(row.ingredientId)) {
        ctx.addIssue({
          code: "custom",
          path: ["recipe", index, "ingredientId"],
          message: "This ingredient is already in the recipe",
        });
      }
      seen.add(row.ingredientId);
    });
  });

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates a new product. */
  product: Product | null;
  categories: Category[];
  ingredients: Ingredient[];
  /** Illustration paths already in use, offered in the picker. */
  images: string[];
  onSaved: () => void;
}

const EMPTY: ProductFormValues = {
  name: "",
  categoryId: "",
  price: 0,
  image: "",
  stockMode: "direct",
  stock: 0,
  minStock: 0,
  isActive: true,
  recipe: [],
};

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  ingredients,
  images,
  onSaved,
}: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ProductFormBody
          product={product}
          categories={categories}
          ingredients={ingredients}
          images={images}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function ProductFormBody({
  product,
  categories,
  ingredients,
  images,
  onOpenChange,
  onSaved,
}: Omit<ProductFormDialogProps, "open">) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? fromProduct(product)
      : { ...EMPTY, categoryId: categories[0]?.id ?? "" },
  });

  /**
   * `useWatch` rather than `watch`: the compiler cannot memoise the `watch()`
   * function react-hook-form returns, so every render re-runs the whole form.
   * One subscription for all six read-only fields keeps it to a single pass.
   */
  const [stockMode, price, recipe, image, categoryId, isActive] = useWatch({
    control,
    name: ["stockMode", "price", "recipe", "image", "categoryId", "isActive"],
  });

  const rows = useFieldArray({ control, name: "recipe" });

  const ingredientById = React.useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients],
  );

  /**
   * Recipe cost, so the form shows what the drink costs to make against what it
   * sells for. It is the figure that tells an admin whether a price change is
   * safe, and nothing else in the app surfaces it.
   */
  const recipeCost = recipe.reduce((total, row) => {
    const ingredient = ingredientById.get(row.ingredientId);
    if (!ingredient || !Number.isFinite(row.qty)) return total;
    return total + ingredient.costPerUnit * row.qty;
  }, 0);

  const margin = price > 0 ? Math.round(((price - recipeCost) / price) * 100) : null;

  async function onSubmit(values: ProductFormValues) {
    setPending(true);
    setFormError(null);

    try {
      const recipeItems: RecipeItem[] =
        values.stockMode === "recipe"
          ? values.recipe.map((row) => ({ ingredientId: row.ingredientId, qty: row.qty }))
          : [];

      const payload: ProductInput = {
        name: values.name.trim(),
        categoryId: values.categoryId,
        price: values.price,
        image: values.image,
        stockMode: values.stockMode,
        isActive: values.isActive,
        recipe: recipeItems,
        ...(values.stockMode === "direct"
          ? { stock: values.stock, minStock: values.minStock }
          : {}),
      };

      const { products } = getRepositories();

      if (product) {
        await products.update(product.id, payload);
      } else {
        await products.create(payload);
      }

      toast({
        title: product ? "Product updated" : "Product created",
        variant: "success",
      });
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save the product.");
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
        <DialogDescription>
          {product
            ? "Changes apply to new orders. Past receipts keep the price they were issued at."
            : "Made-to-order items consume ingredients; packaged goods are counted directly."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              placeholder="e.g. Iced Vanilla Latte"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-category">Category</Label>
            <Select
              value={categoryId}
              onValueChange={(value) =>
                setValue("categoryId", value, { shouldValidate: true })
              }
            >
              <SelectTrigger id="product-category" className="w-full">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors.categoryId?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-price">Price (Rp)</Label>
            <Input
              id="product-price"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              aria-invalid={Boolean(errors.price)}
              {...register("price", { valueAsNumber: true })}
            />
            <FieldError message={errors.price?.message} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="product-image">Illustration</Label>
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    width={300}
                    height={400}
                    className="size-full object-cover"
                  />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                )}
              </span>
              <Select
                value={image}
                onValueChange={(value) => setValue("image", value, { shouldValidate: true })}
              >
                <SelectTrigger id="product-image" className="flex-1">
                  <SelectValue placeholder="Pick an illustration" />
                </SelectTrigger>
                <SelectContent>
                  {images.map((path) => (
                    <SelectItem key={path} value={path}>
                      {path.replace("/menu/", "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FieldError message={errors.image?.message} />
          </div>
        </div>

        <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">How stock is tracked</p>
              <p className="text-xs text-muted-foreground">
                Made-to-order items decrement their ingredients. Packaged goods are counted
                themselves.
              </p>
            </div>
            <Select
              value={stockMode}
              onValueChange={(value) =>
                setValue("stockMode", value as StockMode, { shouldValidate: true })
              }
            >
              <SelectTrigger className="w-44 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Counted directly</SelectItem>
                <SelectItem value="recipe">Made to order</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {stockMode === "direct" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-stock">Opening stock (pcs)</Label>
                <Input
                  id="product-stock"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  {...register("stock", { valueAsNumber: true })}
                />
                <FieldError message={errors.stock?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-min-stock">Reorder at (pcs)</Label>
                <Input
                  id="product-min-stock"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  {...register("minStock", { valueAsNumber: true })}
                />
                <p className="text-xs text-muted-foreground">
                  Raises a restock alert. It does not block selling.
                </p>
              </div>
            </div>
          ) : (
            <RecipeEditor
              control={control}
              register={register}
              fields={rows.fields}
              onAppend={() =>
                rows.append({ ingredientId: ingredients[0]?.id ?? "", qty: 1 })
              }
              onRemove={(index) => rows.remove(index)}
              ingredients={ingredients}
              error={errors.recipe?.[0]?.ingredientId?.message}
            />
          )}

          {stockMode === "recipe" && recipeCost > 0 ? (
            <dl className="grid grid-cols-3 gap-3 border-t pt-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Recipe cost</dt>
                <dd className="font-semibold tabular-nums">
                  {formatIDR(Math.round(recipeCost))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Margin</dt>
                <dd className="font-semibold tabular-nums">
                  {margin === null ? "—" : `${margin}%`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Gross per cup</dt>
                <dd className="font-semibold tabular-nums">
                  {formatIDR(Math.max(0, price - recipeCost))}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <div>
            <Label htmlFor="product-active" className="text-sm">
              Listed on the POS
            </Label>
            <p className="text-xs text-muted-foreground">
              Off means hidden from the till, but past receipts still resolve it.
            </p>
          </div>
          <Switch
            id="product-active"
            checked={isActive}
            onCheckedChange={(checked) => setValue("isActive", checked)}
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
            {product ? "Save changes" : "Create product"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

interface RecipeEditorProps {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  fields: FieldArrayWithId<ProductFormValues, "recipe">[];
  onAppend: () => void;
  onRemove: (index: number) => void;
  ingredients: Ingredient[];
  error?: string;
}

function RecipeEditor({
  control,
  register,
  fields,
  onAppend,
  onRemove,
  ingredients,
  error,
}: RecipeEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Recipe</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAppend}
          disabled={ingredients.length === 0}
        >
          <Plus className="size-4" aria-hidden />
          Add ingredient
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No ingredients yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {fields.map((field, index) => (
            <li key={field.id} className="flex items-end gap-2">
              <RecipeIngredientField
                index={index}
                control={control}
                ingredients={ingredients}
              />

              <div className="w-28 space-y-1.5">
                <Label htmlFor={`recipe-qty-${field.id}`} className="sr-only">
                  Quantity
                </Label>
                <Input
                  id={`recipe-qty-${field.id}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  placeholder="Qty"
                  {...register(`recipe.${index}.qty`, { valueAsNumber: true })}
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove ingredient"
                onClick={() => onRemove(index)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * `useController` rather than spreading register onto a Radix Select: Radix
 * supplies its own value and change handlers, so the field has to be wired
 * through the controller instead.
 */
function RecipeIngredientField({
  index,
  control,
  ingredients,
}: {
  index: number;
  control: Control<ProductFormValues>;
  ingredients: Ingredient[];
}) {
  const { field } = useController({
    control,
    name: `recipe.${index}.ingredientId`,
  });

  return (
    <div className="min-w-0 flex-1">
      <Label htmlFor={`recipe-ingredient-${index}`} className="sr-only">
        Ingredient
      </Label>
      <Select value={field.value} onValueChange={field.onChange}>
        <SelectTrigger id={`recipe-ingredient-${index}`} className="w-full">
          <SelectValue placeholder="Pick an ingredient" />
        </SelectTrigger>
        <SelectContent>
          {ingredients.map((ingredient) => (
            <SelectItem key={ingredient.id} value={ingredient.id}>
              {ingredient.name} · {formatNumber(ingredient.stock)} {ingredient.unit} on hand
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function fromProduct(product: Product): ProductFormValues {
  return {
    name: product.name,
    categoryId: product.categoryId,
    price: product.price,
    image: product.image,
    stockMode: product.stockMode,
    stock: product.stock ?? 0,
    minStock: product.minStock ?? 0,
    isActive: product.isActive,
    recipe: product.recipe.map((item) => ({ ...item })),
  };
}