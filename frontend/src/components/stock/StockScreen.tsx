"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Boxes, Package, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { StaggerGroup, StaggerItem } from "@/components/motion/StaggerGroup";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/dashboard/StatCard";
import { IngredientDialog } from "@/components/stock/IngredientDialog";
import { StockAdjustDialog } from "@/components/stock/StockAdjustDialog";
import { useAsync } from "@/hooks/useAsync";
import { useQueryState } from "@/hooks/useQueryState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuthStore } from "@/store/useAuthStore";
import { getRepositories } from "@/lib/repositories";
import { formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import type {
  Ingredient,
  MovementType,
  Product,
  StockMovement,
} from "@/types/pos";

/**
 * Stock management.
 *
 * Three views over one ledger. Ingredients and counted products each carry their
 * own level, and the movements tab is the history that explains every change —
 * including the ones a sale makes, which is why it is a tab rather than a
 * separate screen: "why is this number wrong" is the question this page exists
 * to answer.
 */

interface StockData {
  ingredients: Ingredient[];
  products: Product[];
  movements: StockMovement[];
  /** Movements matching the filters before the server's page slice. */
  movementTotal: number;
  value: { ingredientsValue: number; retailValue: number; total: number };
}

/**
 * The type filter rides with the request: filtering the newest 200 client-side
 * would answer "what happened recently" with rows of whatever subset happened to
 * be recent, and the ledger's whole point is that "why is this number wrong"
 * gets the same look-back regardless of which type tab you opened.
 */
async function loadStock(movementType: MovementType | "all"): Promise<StockData> {
  const { ingredients, products, stock } = getRepositories();

  const [ingredientList, productList, movementPage, value] = await Promise.all([
    ingredients.list(),
    products.list({ includeInactive: true }),
    stock.movements({
      type: movementType === "all" ? undefined : movementType,
    }),
    stock.value(),
  ]);

  return {
    ingredients: ingredientList,
    products: productList,
    movements: movementPage.data,
    movementTotal: movementPage.total,
    value,
  };
}

const TABS = ["ingredients", "products", "movements"] as const;
type StockTab = (typeof TABS)[number];

const MOVEMENT_FILTERS = ["all", "sale", "void", "purchase", "adjustment", "waste"] as const;

type AdjustTarget =
  | { kind: "ingredient"; record: Ingredient }
  | { kind: "product"; record: Product };

const MOVEMENT_LABEL: Record<MovementType, string> = {
  sale: "Sale",
  void: "Void refund",
  purchase: "Purchase",
  adjustment: "Correction",
  waste: "Waste",
};

const MOVEMENT_VARIANT: Record<MovementType, "secondary" | "outline" | "destructive"> = {
  sale: "secondary",
  void: "outline",
  purchase: "outline",
  adjustment: "outline",
  waste: "destructive",
};

export function StockScreen() {
  /**
   * Tab and movement filter live in the URL: which view you were reading is part
   * of where you were, and losing it on reload defeats the point of the ledger
   * when an admin is chasing a discrepancy.
   */
  const [query, setQuery] = useQueryState();
  const tab: StockTab = TABS.includes(query.tab as StockTab)
    ? (query.tab as StockTab)
    : "ingredients";
  const movementType: MovementType | "all" = (
    MOVEMENT_FILTERS as readonly string[]
  ).includes(query.movement ?? "")
    ? (query.movement as MovementType)
    : "all";

  const { data, error, isLoading, reload } = useAsync(
    () => loadStock(movementType),
    [movementType],
  );

  const [search, setSearch] = React.useState(query.q ?? "");
  const [adjusting, setAdjusting] = React.useState<AdjustTarget | null>(null);
  const [ingredientDialog, setIngredientDialog] = React.useState<
    { mode: "create" } | { mode: "edit"; ingredient: Ingredient } | null
  >(null);

  /**
   * Creating and editing ingredients changes what recipes can be built and what
   * they cost, so it stays with admins; kasirs keep their read-and-adjust view.
   */
  const isAdmin = useAuthStore(
    (state) => state.session?.user?.role === "admin",
  );

  const debouncedSearch = useDebouncedValue(search);

  /**
   * The search box stays local so typing never waits on a navigation; only the
   * settled value is written, one history entry per pause.
   */
  React.useEffect(() => {
    setQuery({ q: debouncedSearch.trim() || null });
  }, [debouncedSearch, setQuery]);

  const ingredients = React.useMemo(() => data?.ingredients ?? [], [data]);
  const products = React.useMemo(() => data?.products ?? [], [data]);
  const movements = React.useMemo(() => data?.movements ?? [], [data]);
  const movementTotal = data?.movementTotal ?? 0;
  const value = data?.value;

  const countedProducts = React.useMemo(
    () => products.filter((product) => product.stockMode === "direct"),
    [products],
  );

  const needle = debouncedSearch.trim().toLowerCase();
  const matches = (value: string) => !needle || value.toLowerCase().includes(needle);

  const filteredIngredients = React.useMemo(
    () => ingredients.filter((ingredient) => matches(ingredient.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ingredients, needle],
  );

  const filteredProducts = React.useMemo(
    () => countedProducts.filter((product) => matches(product.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countedProducts, needle],
  );

  /**
   * The type filter is answered by the server (see `loadStock`); the text
   * needle searches what the ledger page read in.
   */
  const filteredMovements = React.useMemo(
    () =>
      movements.filter((movement) => {
        if (needle && !movement.label.toLowerCase().includes(needle)) return false;
        return true;
      }),
    [movements, needle],
  );

  const lowIngredients = ingredients.filter((i) => i.stock <= i.minStock).length;
  const lowProducts = countedProducts.filter(
    (p) => (p.stock ?? 0) <= (p.minStock ?? 0) && p.isActive,
  ).length;

  const ingredientColumns: Column<Ingredient>[] = [
    {
      key: "name",
      header: "Ingredient",
      sortable: true,
      sort: (ingredient) => ingredient.name,
      cell: (ingredient) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{ingredient.name}</p>
          <p className="text-xs text-muted-foreground">Unit: {ingredient.unit}</p>
        </div>
      ),
    },
    {
      key: "stock",
      header: "On hand",
      numeric: true,
      sortable: true,
      sort: (ingredient) => ingredient.stock,
      cell: (ingredient) => {
        const low = ingredient.stock <= ingredient.minStock;

        return (
          <Badge variant={low ? "destructive" : "secondary"} className="tabular-nums">
            {formatNumber(ingredient.stock)} {ingredient.unit}
          </Badge>
        );
      },
    },
    {
      key: "minStock",
      header: "Reorder at",
      numeric: true,
      sortable: true,
      sort: (ingredient) => ingredient.minStock,
      cell: (ingredient) => (
        <span className="text-muted-foreground tabular-nums">
          {formatNumber(ingredient.minStock)} {ingredient.unit}
        </span>
      ),
    },
    {
      key: "coverage",
      header: "Cover",
      numeric: true,
      sortable: true,
      sort: (ingredient) =>
        ingredient.costPerUnit > 0 ? ingredient.stock * ingredient.costPerUnit : 0,
      cell: (ingredient) => (
        <span className="tabular-nums">
          {formatIDR(Math.round(ingredient.stock * ingredient.costPerUnit))}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-32",
      cell: (ingredient) => (
        <div className="flex items-center justify-end gap-2">
          {isAdmin ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Edit ${ingredient.name}`}
              onClick={() => setIngredientDialog({ mode: "edit", ingredient })}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdjusting({ kind: "ingredient", record: ingredient })}
          >
            Adjust
          </Button>
        </div>
      ),
    },
  ];

  const productColumns: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      sortable: true,
      sort: (product) => product.name,
      cell: (product) => (
        <div className="flex items-center gap-3">
          <span className="size-9 shrink-0 overflow-hidden rounded-lg border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.image}
              alt=""
              width={300}
              height={400}
              className="size-full object-cover"
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{product.name}</p>
            <p className="text-xs text-muted-foreground">
              {product.isActive ? "Listed" : "Hidden"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "stock",
      header: "On hand",
      numeric: true,
      sortable: true,
      sort: (product) => product.stock ?? 0,
      cell: (product) => {
        const stock = product.stock ?? 0;
        const low = product.isActive && stock <= (product.minStock ?? 0);

        return (
          <Badge variant={low ? "destructive" : "secondary"} className="tabular-nums">
            {formatNumber(stock)} pcs
          </Badge>
        );
      },
    },
    {
      key: "minStock",
      header: "Reorder at",
      numeric: true,
      sortable: true,
      sort: (product) => product.minStock ?? 0,
      cell: (product) => (
        <span className="text-muted-foreground tabular-nums">
          {formatNumber(product.minStock ?? 0)} pcs
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-24",
      cell: (product) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAdjusting({ kind: "product", record: product })}
        >
          Adjust
        </Button>
      ),
    },
  ];

  const movementColumns: Column<StockMovement>[] = [
    {
      key: "type",
      header: "Type",
      sortable: true,
      sort: (movement) => movement.type,
      cell: (movement) => (
        <Badge variant={MOVEMENT_VARIANT[movement.type]}>
          {MOVEMENT_LABEL[movement.type]}
        </Badge>
      ),
    },
    {
      key: "label",
      header: "Item",
      sortable: true,
      sort: (movement) => movement.label,
      cell: (movement) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{movement.label}</p>
          {movement.note ? (
            <p className="truncate text-xs text-muted-foreground">{movement.note}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "qty",
      header: "Change",
      numeric: true,
      sortable: true,
      sort: (movement) => movement.qty,
      cell: (movement) => (
        <span
          className={
            movement.qty >= 0
              ? "inline-flex items-center gap-1 font-medium text-primary tabular-nums"
              : "inline-flex items-center gap-1 font-medium text-destructive tabular-nums"
          }
        >
          {movement.qty >= 0 ? (
            <ArrowUpRight className="size-3.5" aria-hidden />
          ) : (
            <ArrowDownRight className="size-3.5" aria-hidden />
          )}
          {movement.qty >= 0 ? "+" : ""}
          {formatNumber(movement.qty)} {movement.unit ?? ""}
        </span>
      ),
    },
    {
      key: "by",
      header: "By",
      cell: (movement) => (
        <span className="text-sm text-muted-foreground">{movement.byUserName}</span>
      ),
    },
    {
      key: "when",
      header: "When",
      sortable: true,
      sort: (movement) => new Date(movement.createdAt).getTime(),
      cell: (movement) => (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {formatDateTime(movement.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock management"
        description={`${formatNumber(ingredients.length)} ingredients and ${formatNumber(countedProducts.length)} counted products${
          lowIngredients + lowProducts > 0
            ? ` · ${lowIngredients + lowProducts} at or below the reorder point`
            : ""
        }`}
        actionLabel={isAdmin && tab === "ingredients" ? "New ingredient" : undefined}
        actionIcon={Plus}
        onAction={
          isAdmin && tab === "ingredients"
            ? () => setIngredientDialog({ mode: "create" })
            : undefined
        }
      />

      <StaggerGroup className="space-y-5">
        {error ? (
          <StaggerItem>
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </p>
          </StaggerItem>
        ) : null}

        {value ? (
          <StaggerItem>
            <div className="grid gap-4 sm:grid-cols-3">
              <ValueCard
                label="Ingredient cost value"
                amount={value.ingredientsValue}
                hint="Stock on hand at unit cost"
              />
              <ValueCard
                label="Counted product value"
                amount={value.retailValue}
                hint="Packaged stock at selling price, not cost"
              />
              <ValueCard
                label="Combined"
                amount={value.total}
                hint="Mixed basis — treat as an order of magnitude"
              />
            </div>
          </StaggerItem>
        ) : null}

        <StaggerItem>
      <Tabs value={tab} onValueChange={(value) => setQuery({ tab: value === "ingredients" ? null : value })}>
        <TabsList>
          <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
          <TabsTrigger value="products">Counted products</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
        </TabsList>

        <div className="mt-4 space-y-4">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search stock…"
            searchLabel="Search stock"
            options={[]}
            active={null}
            onActiveChange={() => {}}
            trailing={
              /**
               * Only the ledger has movements, so the type filter appears with
               * it. Left visible on the other tabs it would look like it
               * filtered ingredients and silently do nothing.
               */
              tab === "movements" ? (
                <Select
                  value={movementType}
                  onValueChange={(value) =>
                    setQuery({ movement: value === "all" ? null : value })
                  }
                >
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All movements</SelectItem>
                    <SelectItem value="sale">Sales</SelectItem>
                    <SelectItem value="void">Void refunds</SelectItem>
                    <SelectItem value="purchase">Purchases</SelectItem>
                    <SelectItem value="adjustment">Corrections</SelectItem>
                    <SelectItem value="waste">Waste</SelectItem>
                  </SelectContent>
                </Select>
              ) : null
            }
          />

          <TabsContent value="ingredients">
            <DataTable
              columns={ingredientColumns}
              rows={filteredIngredients}
              rowKey={(ingredient) => ingredient.id}
              isLoading={isLoading}
              emptyIcon={Boxes}
              emptyTitle="No ingredients match"
              emptyDescription="Ingredients are managed on the products screen."
            />
          </TabsContent>

          <TabsContent value="products">
            <DataTable
              columns={productColumns}
              rows={filteredProducts}
              rowKey={(product) => product.id}
              isLoading={isLoading}
              emptyIcon={Package}
              emptyTitle="No counted products match"
              emptyDescription="Made-to-order items are covered by their ingredients."
            />
          </TabsContent>

          <TabsContent value="movements">
            {movementTotal > movements.length ? (
              <p className="mb-3 text-xs text-muted-foreground">
                Showing the newest {formatNumber(movements.length)} of{" "}
                {formatNumber(movementTotal)} movements. Filter by type or
                search to narrow the look-back.
              </p>
            ) : null}
            <DataTable
              columns={movementColumns}
              rows={filteredMovements}
              rowKey={(movement) => movement.id}
              isLoading={isLoading}
              pageSize={12}
              emptyIcon={SlidersHorizontal}
              emptyTitle="No movements yet"
              emptyDescription="Sales and stock adjustments are recorded here as they happen."
            />
          </TabsContent>
        </div>
      </Tabs>
        </StaggerItem>
      </StaggerGroup>

      <IngredientDialog
        open={ingredientDialog !== null}
        onOpenChange={(open) => {
          if (!open) setIngredientDialog(null);
        }}
        ingredient={ingredientDialog?.mode === "edit" ? ingredientDialog.ingredient : null}
        onSaved={reload}
      />

      <StockAdjustDialog
        open={adjusting !== null}
        onOpenChange={(open) => {
          if (!open) setAdjusting(null);
        }}
        target={adjusting}
        onDone={reload}
      />
    </div>
  );
}

function ValueCard({
  label,
  amount,
  hint,
}: {
  label: string;
  amount: number;
  hint: string;
}) {
  return (
    <SectionCard title={label}>
      <div className="px-5 py-4">
        <p className="text-xl font-bold tracking-tight tabular-nums">{formatIDR(amount)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
    </SectionCard>
  );
}