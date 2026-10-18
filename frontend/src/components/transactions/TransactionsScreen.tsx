"use client";

import * as React from "react";
import { MessageCircle, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { useAsync } from "@/hooks/useAsync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQueryState } from "@/hooks/useQueryState";
import { dayKeyDaysAgo, todayKey } from "@/lib/repositories/read-models";
import { getRepositories } from "@/lib/repositories";
import { formatDate, formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import { whatsAppLink } from "@/lib/receipt";
import { cn } from "@/lib/utils";
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

async function loadOrders(query: { from?: string; to?: string }): Promise<Order[]> {
  return getRepositories().orders.list(query);
}

export function TransactionsScreen() {
  const [query, setQuery] = useQueryState();

  const [search, setSearch] = React.useState(query.q ?? "");
  const debouncedSearch = useDebouncedValue(search);

  React.useEffect(() => {
    setQuery({ q: debouncedSearch.trim() || null });
  }, [debouncedSearch, setQuery]);

  /**
   * `range` is deliberately not written to the URL as two dates the way the
   * reports screen does. A transaction list is a "show me the last sale" tool,
   * and the presets are the only ways it is ever opened here, so the exact
   * window does not need to survive a reload or be linked to.
   */
  const preset = (query.range as Preset | undefined) ?? "7d";
  const method = (query.method as PaymentMethod | undefined) ?? null;

  const range = preset === "all" ? {} : rangeFor(preset);
  const { data: orders, error, isLoading } = useAsync(
    () => loadOrders(range),
    [preset],
  );

  const [reprint, setReprint] = React.useState<Order | null>(null);

  const visible = React.useMemo(() => {
    const term = (query.q ?? "").trim().toLowerCase();

    return (orders ?? []).filter((order) => {
      if (method && order.paymentMethod !== method) return false;
      if (!term) return true;

      // Receipt number is how a customer quotes a transaction back to a cashier,
      // so it is searched alongside the name and number the sale was made under.
      return (
        order.receiptNo.toLowerCase().includes(term) ||
        order.customer?.name.toLowerCase().includes(term) === true ||
        order.customer?.phone.includes(term) === true
      );
    });
  }, [orders, method, query.q]);

  const summary = React.useMemo(() => {
    const revenue = visible.reduce((sum, order) => sum + order.total, 0);

    return {
      revenue,
      transactions: visible.length,
      average:
        visible.length > 0 ? Math.round(revenue / visible.length) : 0,
      withCustomer: visible.filter((order) => order.customer).length,
    };
  }, [visible]);

  const activePreset = (query.range as Preset | undefined) ?? "7d";

  const columns: Column<Order>[] = [
    {
      key: "receipt",
      header: "Receipt",
      sortable: true,
      sort: (order) => order.receiptNo,
      cell: (order) => (
        <div className="min-w-0">
          <p className="font-medium tabular-nums">{order.receiptNo}</p>
          {/*
            The customer sits under the receipt number rather than in its own
            column: on this screen the sale and who it was for are one fact, and
            walk-in rows stay aligned when most of a page has no name to show.
          */}
          {order.customer ? (
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
        <span className="font-semibold">{formatIDR(order.total)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-44",
      cell: (order) => {
        const whatsapp = whatsAppLink(order);

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
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        description={
          preset === "all"
            ? `${formatNumber(summary.transactions)} sales across all time`
            : `${formatDate(rangeFor(preset).from)} to ${formatDate(
                rangeFor(preset).to,
              )} · ${formatNumber(summary.transactions)} sales`
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-2 pb-0.5">
          {PRESETS.map((option) => (
            <Button
              key={option.key}
              size="sm"
              variant={activePreset === option.key ? "default" : "outline"}
              onClick={() => setQuery({ range: option.key })}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pb-0.5">
          {METHODS.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={method === option.value}
              onClick={() =>
                setQuery({ method: option.value ?? null })
              }
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                method === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Revenue" value={formatIDR(summary.revenue)} />
        <SummaryTile
          label="Transactions"
          value={formatNumber(summary.transactions)}
        />
        <SummaryTile
          label="Average order"
          value={formatIDR(summary.average)}
        />
        <SummaryTile
          label="With customer details"
          value={formatNumber(summary.withCustomer)}
          hint="can be sent"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(order) => order.id}
        isLoading={isLoading}
        pageSize={12}
        emptyTitle="No transactions found"
        emptyDescription="Nothing matches these filters in this period."
      />

      {/*
        The same modal the till uses after a sale. Reopening it here is what makes
        a reprint the original document: the receipt is rendered from the stored
        lines and totals, not recomputed from the current menu.
      */}
      <ReceiptModal
        order={reprint}
        onOpenChange={(open) => {
          if (!open) setReprint(null);
        }}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}