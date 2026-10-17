"use client";

import * as React from "react";
import {
  Archive,
  FolderTree,
  GlassWater,
  MoreHorizontal,
  Package,
  Pencil,
  Power,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { CategoryManagerDialog } from "@/components/products/CategoryManagerDialog";
import { useToast } from "@/components/ui/toast";
import { useAsync } from "@/hooks/useAsync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getRepositories } from "@/lib/repositories";
import { formatIDR, formatNumber } from "@/lib/format";
import { maxServings, type Category, type Ingredient, type Product } from "@/types/pos";

/**
 * Product management.
 *
 * One screen covers the whole catalogue: filter, inspect stock, edit, activate,
 * archive, and manage categories. Deleting is deliberately not offered — past
 * receipts reference products by id, so a product is archived instead and drops
 * out of the POS while its history stays resolvable.
 */

type StatusFilter = "active" | "inactive" | "all";
type ModeFilter = "all" | "recipe" | "direct";

interface Catalogue {
  products: Product[];
  categories: Category[];
  ingredients: Ingredient[];
}

async function loadCatalogue(): Promise<Catalogue> {
  const { products, categories, ingredients } = getRepositories();

  const [productList, categoryList, ingredientList] = await Promise.all([
    // Inactive items are loaded too: this screen is where they get reviewed and
    // brought back, so hiding them would remove the only place to do that.
    products.list({ includeInactive: true }),
    categories.list(),
    ingredients.list(),
  ]);

  return { products: productList, categories: categoryList, ingredients: ingredientList };
}

export function ProductsScreen() {
  const { data, error, isLoading, reload } = useAsync(loadCatalogue);
  const { toast } = useToast();

  const [search, setSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<StatusFilter>("active");
  const [mode, setMode] = React.useState<ModeFilter>("all");

  const [editing, setEditing] = React.useState<Product | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [categoriesOpen, setCategoriesOpen] = React.useState(false);
  const [archiving, setArchiving] = React.useState<Product | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  /**
   * Memoised rather than inlined as `data?.products ?? []`: a fresh empty array
   * on every render would invalidate every filter and column memo downstream,
   * which is exactly the cost this screen pays most for having several of them.
   */
  const products = React.useMemo(() => data?.products ?? [], [data]);
  const categories = React.useMemo(() => data?.categories ?? [], [data]);
  const ingredients = React.useMemo(() => data?.ingredients ?? [], [data]);

  const categoryById = React.useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const ingredientMap = React.useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );

  const usage = React.useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    });
    return counts;
  }, [products]);

  const filtered = React.useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();

    return products.filter((product) => {
      if (status === "active" && !product.isActive) return false;
      if (status === "inactive" && product.isActive) return false;
      if (categoryId && product.categoryId !== categoryId) return false;
      if (mode !== "all" && product.stockMode !== mode) return false;
      if (needle && !product.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [products, debouncedSearch, categoryId, status, mode]);

  /**
   * Counted per category over the rows that survive the other filters, so the
   * chip for "Snack" says how many snacks there are rather than the menu total.
   */
  const categoryOptions = React.useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
        count: products.filter(
          (product) =>
            product.categoryId === category.id &&
            (status === "all" || (status === "active" ? product.isActive : !product.isActive)),
        ).length,
      })),
    [categories, products, status],
  );

  const images = React.useMemo(
    () => [...new Set(products.map((product) => product.image))].sort(),
    [products],
  );

  /**
   * A product needs restocking when it cannot be made from current stock, which
   * means one of its ingredients has hit its reorder threshold. Counting
   * servings against a fixed number instead would flag a drink at 40 servings
   * purely because the threshold was arbitrary, and miss a real shortage on a
   * drink that uses very little of something.
   */
  const restocking = React.useMemo(
    () => products.filter((product) => isRestocking(product, ingredientMap)),
    [products, ingredientMap],
  );

  async function toggleActive(product: Product) {
    try {
      await getRepositories().products.setActive(product.id, !product.isActive);
      toast({
        title: product.isActive ? "Hidden from the POS" : "Listed on the POS",
        variant: "success",
      });
      reload();
    } catch (cause) {
      toast({
        title: "Could not change the status",
        description: cause instanceof Error ? cause.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      sortable: true,
      sort: (product) => product.name,
      cell: (product) => (
        <button
          type="button"
          onClick={() => {
            setEditing(product);
            setFormOpen(true);
          }}
          className="flex items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="size-9 shrink-0 overflow-hidden rounded-lg border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.image} alt="" className="size-full object-cover" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{product.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {categoryById.get(product.categoryId)?.name ?? "Uncategorised"}
            </span>
          </span>
          <span className="sr-only">Edit {product.name}</span>
        </button>
      ),
    },
    {
      key: "price",
      header: "Price",
      numeric: true,
      sortable: true,
      sort: (product) => product.price,
      cell: (product) => <span className="text-sm font-medium">{formatIDR(product.price)}</span>,
    },
    {
      key: "mode",
      header: "Stock",
      sortable: true,
      sort: (product) => product.stockMode,
      cell: (product) => <StockCell product={product} ingredients={ingredientMap} />,
    },
    {
      key: "margin",
      header: "Cost",
      numeric: true,
      sortable: true,
      sort: (product) => recipeCostOf(product, ingredientMap) ?? 0,
      cell: (product) => {
        const cost = recipeCostOf(product, ingredientMap);
        if (cost === null) return <span className="text-muted-foreground">—</span>;

        return (
          <div>
            <p className="text-sm tabular-nums">{formatIDR(Math.round(cost))}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {product.price > 0
                ? `${Math.round(((product.price - cost) / product.price) * 100)}% margin`
                : "no margin"}
            </p>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sort: (product) => (product.isActive ? "active" : "inactive"),
      cell: (product) =>
        product.isActive ? (
          <Badge variant="secondary">Listed</Badge>
        ) : (
          <Badge variant="outline">Hidden</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (product) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${product.name}`}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setEditing(product);
                setFormOpen(true);
              }}
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void toggleActive(product)}>
              <Power className="size-4" aria-hidden />
              {product.isActive ? "Hide from POS" : "List on POS"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!product.isActive}
              onSelect={() => setArchiving(product)}
            >
              <Archive className="size-4" aria-hidden />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Product management"
        description={`${formatNumber(products.length)} menu items across ${formatNumber(categories.length)} categories${
          restocking.length > 0 ? ` · ${restocking.length} need restocking` : ""
        }`}
        actionLabel="New product"
        onAction={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        secondary={
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            <FolderTree className="size-4" aria-hidden />
            Categories
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search products"
        options={categoryOptions}
        active={categoryId}
        onActiveChange={setCategoryId}
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={mode} onValueChange={(value) => setMode(value as ModeFilter)}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock modes</SelectItem>
                <SelectItem value="recipe">Made to order</SelectItem>
                <SelectItem value="direct">Counted directly</SelectItem>
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Listed</SelectItem>
                <SelectItem value="inactive">Hidden</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(product) => product.id}
        isLoading={isLoading}
        emptyIcon={Package}
        emptyTitle="No products match"
        emptyDescription="Adjust the search or filters, or add a new product."
      />

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        categories={categories}
        ingredients={ingredients}
        images={images}
        onSaved={reload}
      />

      <CategoryManagerDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={categories}
        usage={usage}
        onChanged={reload}
      />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
        title={`Archive ${archiving?.name ?? "this product"}?`}
        description="It disappears from the POS and the catalogue. Past receipts keep it, so historical totals stay correct."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => {
          if (!archiving) return;
          await getRepositories().products.archive(archiving.id);
          toast({ title: "Product archived", variant: "success" });
          reload();
        }}
      />
    </div>
  );
}

/**
 * Cost to make one serving, or null for counted items where no cost is tracked.
 */
function recipeCostOf(
  product: Product,
  ingredients: Map<string, Ingredient>,
): number | null {
  if (product.stockMode === "direct") return null;

  return product.recipe.reduce((total, item) => {
    const ingredient = ingredients.get(item.ingredientId);
    return ingredient ? total + ingredient.costPerUnit * item.qty : total;
  }, 0);
}

/**
 * Whether this product is currently short of something it needs to be made or
 * sold. Counted items compare their own level to their reorder point; recipe
 * items inherit the status of their tightest ingredient, which is the level an
 * admin would actually reorder.
 */
function isRestocking(
  product: Product,
  ingredients: Map<string, Ingredient>,
): boolean {
  if (!product.isActive) return false;

  if (product.stockMode === "direct") {
    return typeof product.stock === "number" && product.stock <= (product.minStock ?? 0);
  }

  return product.recipe.some((item) => {
    const ingredient = ingredients.get(item.ingredientId);
    return ingredient ? ingredient.stock <= ingredient.minStock : false;
  });
}

function StockCell({
  product,
  ingredients,
}: {
  product: Product;
  ingredients: Map<string, Ingredient>;
}) {
  if (product.stockMode === "direct") {
    const stock = product.stock ?? 0;
    const min = product.minStock ?? 0;
    const isLow = stock <= min;

    return (
      <div className="flex items-center gap-2">
        <Badge variant={isLow ? "destructive" : "secondary"} className="tabular-nums">
          {formatNumber(stock)} pcs
        </Badge>
        {isLow ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            min {formatNumber(min)}
          </span>
        ) : null}
      </div>
    );
  }

  const servings = maxServings(product, ingredients);

  /**
   * The ingredient that sets the ceiling, named so the number is actionable:
   * "16 servings" is a fact, "16 servings, limited by Fresh Milk" is a reason.
   */
  let binding: { ingredient: Ingredient; servings: number } | null = null;
  for (const item of product.recipe) {
    const ingredient = ingredients.get(item.ingredientId);
    if (!ingredient || item.qty <= 0) continue;

    const available = Math.floor(ingredient.stock / item.qty);
    if (!binding || available < binding.servings) {
      binding = { ingredient, servings: available };
    }
  }

  const isLow = isRestocking(product, ingredients);

  return (
    <div>
      <Badge variant={isLow ? "destructive" : "secondary"} className="tabular-nums">
        <GlassWater className="size-3" aria-hidden />
        ≈ {formatNumber(servings ?? 0)} servings
      </Badge>
      {binding ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          limited by {binding.ingredient.name}
        </p>
      ) : null}
    </div>
  );
}