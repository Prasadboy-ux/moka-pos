"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Ban, MessageCircle, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

import { DataTable, type Column } from "@/components/data-table";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { StaggerGroup, StaggerItem } from "@/components/motion/StaggerGroup";
import { PageHeader } from "@/components/page-header";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { VoidOrderDialog } from "@/components/transactions/VoidOrderDialog";
import { useAsync } from "@/hooks/useAsync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQueryState } from "@/hooks/useQueryState";
import { dayKeyDaysAgo, todayKey } from "@/lib/repositories/read-models";
import { getRepositories } from "@/lib/repositories";
import { formatDate, formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import { whatsAppLink } from "@/lib/receipt";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import {
  PAYMENT_LABEL,
  type Order,
  type PaymentMethod,
} from "@/types/pos";

/**
 * Every sale taken, searchable, reprintable, and sendable.
 *
 * This is the screen the cashier and the owner both actually want: the till
 * drawer broke, a customer disputes what they paid, or a receipt needs reissuing
 * three days later. It reads the same `OrderRepository` the POS writes through,
 * so a reprint is the original document rather than a reconstruction of today's
 * catalogue — the lines carry the price that was charged.
 */

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
] as const;

type Preset = (typeof PRESETS)[number]["key"];

const METHODS: Array<{ value: PaymentMethod | null; label: string }> = [
  { value: null, label: "All methods" },
  { value: "cash", label: PAYMENT_LABEL.cash },
  { value: "qris", label: PAYMENT_LABEL.qris },
  { value: "debit", label: PAYMENT_LABEL.debit },
  { value: "credit", label: PAYMENT_LABEL.credit },
];

function rangeFor(preset: Exclude<Preset, "all">): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: todayKey(), to: todayKey() };
    case "30d":
      return { from: dayKeyDaysAgo(29), to: todayKey() };
    case "7d":
    default:
      return { from: dayKeyDaysAgo(6), to: todayKey() };
  }
}

/**
 * The explicit window the "All time" preset asks the aggregate over. A report
 * never quietly defaults to a window, so one is named — the earliest date the
 * modifier could plausibly have started trading. The aggregate month-buckets
 * spans this long, so the reply stays a few dozen kilobytes, not thousands of
 * day points.
 */
const ALL_TIME_FROM = "2000-01-01";

/**
 * One screen, two questions about the same window: the ledger page for the
 * table and the paid-only aggregate for the tiles. Both read the same filters
 * (method, search term), so what a tile lists is exactly what its tiles count.
 *
 * Reads config first: its reply adopts the zone the API buckets days in, which
 * is the zone `rangeFor` computes `todayKey()` with — on a cold session the
 * build-time default answers until config lands.
 */
async function loadScreen(filter: {
  preset: Preset;
  method?: PaymentMethod;
  q?: string;
}): Promise<{
  table: { data: Order[]; total: number };
  kpi: {
    revenue: number;
    transactions: number;
    averageOrderValue: number;
    withCustomer: number;
  };
}> {
  const { config, orders, reports } = getRepositories();
  await config.get();

  const range: { from?: string; to?: string } =
    filter.preset === "all" ? {} : rangeFor(filter.preset);

  const [table, aggregate] = await Promise.all([
    orders.list({ ...range, method: filter.method, q: filter.q }),
    reports.sales(range.from ?? ALL_TIME_FROM, range.to ?? todayKey(), {
      method: filter.method,
      q: filter.q,
    }),
  ]);

  return { table, kpi: aggregate.kpi };
}

export function TransactionsScreen() {
  const [query, setQuery] = useQueryState();

  const [search, setSearch] = React.useState(query.q ?? "");
  const debouncedSearch = useDebouncedValue(search);

  React.useEffect(() => {
    setQuery({ q: debouncedSearch.trim() || null });
  }, [debouncedSearch, setQuery]);

  const preset = (query.range as Preset | undefined) ?? "7d";
  const method = (query.method as PaymentMethod | undefined) ?? null;
  const term = (query.q ?? "").trim();

  /**
   * The window is deliberately not written to the URL as two dates the way the
   * reports screen does. A transaction list is a "show me the last sale" tool,
   * and the presets are the only ways it is ever opened here, so the exact
   * window does not need to survive a reload or be linked to. The loader
   * computes it from the preset after adopting the store's zone, and the
   * header labels below recompute it the same way for display only.
   */

  const { data, error, isLoading, reload } = useAsync(
    () =>
      loadScreen({
        preset,
        method: method ?? undefined,
        q: term || undefined,
      }),
    [preset, method, term],
  );

  const table = data?.table.data ?? [];
  const kpi = data?.kpi ?? {
    revenue: 0,
    transactions: 0,
    averageOrderValue: 0,
    withCustomer: 0,
  };

  const [reprint, setReprint] = React.useState<Order | null>(null);
  const [voiding, setVoiding] = React.useState<Order | null>(null);
  const { toast } = useToast();
  const currentUser = useAuthStore((state) => state.session?.user ?? null);
  // Reversing money is an admin decision; the API refuses a kasir regardless.
  const canVoid = currentUser?.role === "admin";

  /**
   * A voided receipt is history, not revenue. The aggregate the tiles read is
   * paid-only by construction — the badge here counts the reversed receipts the
   * table shows, so the two views keep telling one truth apart.
   */
  const voidedCount = table.filter((order) => order.status === "voided").length;

  const columns: Column<Order>[] = [
    {
      key: "receipt",
      header: "Receipt",
      sortable: true,
      sort: (order) => order.receiptNo,
      cell: (order) => (
        <div className="min-w-0">
          <p
            className={cn(
              "font-medium tabular-nums",
              order.status === "voided" && "text-muted-foreground line-through",
            )}
          >
            {order.receiptNo}
          </p>
          {order.status === "voided" ? (
            <p className="text-xs font-medium text-destructive" title={order.voidReason ?? ""}>
              Voided{order.voidedByName ? ` · ${order.voidedByName}` : ""}
            </p>
          ) : order.customer ? (
            <p className="truncate text-xs text-muted-foreground">
              {order.customer.name}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "when",
      header: "When",
      sortable: true,
      sort: (order) => new Date(order.createdAt).getTime(),
      cell: (order) => (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {formatDateTime(order.createdAt)}
        </span>
      ),
    },
    {
      key: "items",
      header: "Items",
      numeric: true,
      sortable: true,
      sort: (order) => order.lines.reduce((n, line) => n + line.qty, 0),
      cell: (order) => (
        <span className="text-muted-foreground">
          {formatNumber(order.lines.reduce((n, line) => n + line.qty, 0))}
        </span>
      ),
    },
    {
      key: "method",
      header: "Payment",
      sortable: true,
      sort: (order) => order.paymentMethod,
      cell: (order) => (
        <Badge variant={order.paymentMethod === "cash" ? "outline" : "secondary"}>
          {PAYMENT_LABEL[order.paymentMethod]}
        </Badge>
      ),
    },
    {
      key: "cashier",
      header: "Cashier",
      sortable: true,
      sort: (order) => order.cashierName,
      cell: (order) => (
        <span className="text-sm text-muted-foreground">{order.cashierName}</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      numeric: true,
      sortable: true,
      sort: (order) => order.total,
      cell: (order) => (
        <span
          className={cn(
            "font-semibold",
            order.status === "voided" && "text-muted-foreground line-through",
          )}
        >
          {formatIDR(order.total)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-52",
      cell: (order) => {
        const whatsapp = whatsAppLink(order);
        const showVoid = canVoid && order.status === "paid";

        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReprint(order)}
            >
              <Printer className="size-4" aria-hidden />
              Reprint
            </Button>

            {whatsapp ? (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Send receipt ${order.receiptNo} on WhatsApp`}
                >
                  <MessageCircle className="size-4" aria-hidden />
                </a>
              </Button>
            ) : null}

            {showVoid ? (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Void receipt ${order.receiptNo}`}
                onClick={() => setVoiding(order)}
              >
                <Ban className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  function handleVoided(order: Order, warnings: string[]) {
    // Stock was restated by the void; the list is re-read rather than patched,
    // so the table never disagrees with the ledger.
    reload();
    setVoiding(null);

    if (warnings.length > 0) {
      toast({
        title: `${order.receiptNo} voided with a caveat`,
        description: warnings[0],
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        description={
          preset === "all"
            ? `${formatNumber(kpi.transactions)} sales across all time`
            : `${formatDate(rangeFor(preset).from)} to ${formatDate(
                rangeFor(preset).to,
              )} · ${formatNumber(kpi.transactions)} sales`
        }
      />

      <StaggerGroup className="space-y-5">
        <StaggerItem>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap gap-2 pb-0.5">
          {PRESETS.map((option) => (
            <Button
              key={option.key}
              size="sm"
              variant={preset === option.key ? "default" : "outline"}
              onClick={() => setQuery({ range: option.key })}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pb-0.5">
          {METHODS.map((option) => (
            <motion.button
              key={option.label}
              type="button"
              aria-pressed={method === option.value}
              onClick={() =>
                setQuery({ method: option.value ?? null })
              }
              whileTap={{ scale: 0.97 }}
              transition={SPRING}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                method === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {option.label}
            </motion.button>
          ))}
          {voidedCount > 0 ? (
            <Badge variant="destructive" className="rounded-full self-center px-3.5 py-1.5">
              {formatNumber(voidedCount)} voided
            </Badge>
          ) : null}
        </div>

        <div className="min-w-48 flex-1 space-y-2">
          <Label htmlFor="transaction-search" className="sr-only">
            Search transactions
          </Label>
          <Input
            id="transaction-search"
            type="search"
            name="transaction-search"
            autoComplete="off"
            placeholder="Receipt, name, or phone…"
            aria-label="Search transactions"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryTile
              label="Revenue"
              value={kpi.revenue}
              format={formatIDR}
            />
            <SummaryTile
              label="Transactions"
              value={kpi.transactions}
              format={formatNumber}
            />
            <SummaryTile
              label="Average order"
              value={kpi.averageOrderValue}
              format={formatIDR}
            />
            <SummaryTile
              label="With customer details"
              value={kpi.withCustomer}
              format={formatNumber}
              hint="can be sent"
            />
          </div>
        </StaggerItem>

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

        <StaggerItem>
          <DataTable
            columns={columns}
            rows={table}
            rowKey={(order) => order.id}
            isLoading={isLoading}
            pageSize={12}
            emptyTitle="No transactions found"
            emptyDescription="Nothing matches these filters in this period."
          />
        </StaggerItem>
      </StaggerGroup>

      {/*
        The same modal the till uses after a sale. Reopening it here is what makes
        a reprint the original document: the receipt is rendered from the stored
        lines and totals, not recomputed from the current menu. It stays mounted
        between receipts so closing animates out instead of blinking away.
      */}
      <ReceiptModal
        order={reprint}
        onOpenChange={(open) => {
          if (!open) setReprint(null);
        }}
      />

      {/*
        No re-key needed: the dialog body mounts per open inside the animated
        content slot, so each void starts with an empty reason field while the
        shell survives the exit animation.
      */}
      <VoidOrderDialog
        order={voiding}
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
        onVoided={handleVoided}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  format,
  hint,
}: {
  label: string;
  value: number;
  format: (value: number) => string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">
        <AnimatedNumber value={value} format={format} />
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}