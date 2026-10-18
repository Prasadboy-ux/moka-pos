"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Download, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/dashboard/StatCard";
import { useToast } from "@/components/ui/toast";
import { useAsync } from "@/hooks/useAsync";
import { useQueryState } from "@/hooks/useQueryState";
import {
  dayKeyDaysAgo,
  delta,
  getSalesReport,
  toDayKey,
  todayKey,
  type CashierSalesRow,
  type CategorySalesRow,
  type ProductSalesRow,
  type SalesReport,
  type TrendBucket,
} from "@/lib/repositories/read-models";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatIDR, formatMonth, formatNumber } from "@/lib/format";
import { PAYMENT_LABEL } from "@/types/pos";

/**
 * Sales reporting.
 *
 * The range is closed on both ends and every figure carries a comparison with
 * the equivalent range immediately before it, because a total on its own cannot
 * be read: last week's Rp 4.5 million is good news or bad news depending on what
 * the week before did.
 */

type Preset = "today" | "7d" | "30d" | "12m" | "custom";

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "12m", label: "Last 12 months" },
] as const;

function rangeFor(preset: Exclude<Preset, "custom">): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: todayKey(), to: todayKey() };
    case "30d":
      return { from: dayKeyDaysAgo(29), to: todayKey() };
    case "12m": {
      /**
       * Back to the first of the month 11 months back, so the range is twelve
       * whole calendar months ending with the current one — which is the shape
       * that makes the chart switch to monthly buckets.
       */
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(1);
      start.setMonth(start.getMonth() - 11);
      return { from: toDayKey(start.getTime()), to: todayKey() };
    }
    case "7d":
    default:
      return { from: dayKeyDaysAgo(6), to: todayKey() };
  }
}

async function loadReport(from: string, to: string): Promise<SalesReport> {
  return getSalesReport(from, to);
}

export function ReportsScreen() {
  const { toast } = useToast();

  /**
   * The range lives in the URL so it survives a reload, works with the back
   * button, and can be linked to. Preset and date inputs both write it; the
   * preset is inferred from the range so the right button stays highlighted.
   */
  const [query, setQuery] = useQueryState();

  const from = query.from ?? rangeFor("7d").from;
  const to = query.to ?? rangeFor("7d").to;

  /**
   * A range typed by hand can arrive inverted, which would silently report an
   * empty period. Swapping the ends is friendlier than refusing the input.
   */
  const ordered = from <= to ? { from, to } : { from: to, to: from };

  const activePreset = React.useMemo(() => {
    if (query.from && query.to) return "custom";
    const match = (PRESETS.find((option) => {
      const range = rangeFor(option.key);
      return range.from === from && range.to === to;
    }) ?? null);
    return match?.key ?? "custom";
  }, [from, to, query.from, query.to]);

  /**
   * The query gets the ordered range, not the raw one. A hand-typed range that
   * arrives inverted would otherwise fetch an empty window while the header
   * showed the swapped dates — a report that reads as "no sales" for a period
   * the reader can plainly see sales on the adjacent card for.
   */
  const { data: report, error, isLoading } = useAsync(
    () => loadReport(ordered.from, ordered.to),
    [ordered.from, ordered.to],
  );

  function applyPreset(key: Exclude<Preset, "custom">) {
    const range = rangeFor(key);
    setQuery({ from: range.from, to: range.to });
  }

  function onDateChange(field: "from" | "to", value: string) {
    if (!value) return;
    setQuery({ [field]: value });
  }

  const categoryColumns: Column<CategorySalesRow>[] = [
    {
      key: "name",
      header: "Category",
      sortable: true,
      sort: (row) => row.categoryName,
      cell: (row) => <span className="text-sm font-medium">{row.categoryName}</span>,
    },
    {
      key: "items",
      header: "Items sold",
      numeric: true,
      sortable: true,
      sort: (row) => row.itemsSold,
      cell: (row) => formatNumber(row.itemsSold),
    },
    {
      key: "revenue",
      header: "Revenue",
      numeric: true,
      sortable: true,
      sort: (row) => row.revenue,
      cell: (row) => <span className="font-semibold">{formatIDR(row.revenue)}</span>,
    },
    {
      key: "share",
      header: "Share",
      numeric: true,
      cell: (row) => {
        const total = report?.byCategory.reduce((sum, r) => sum + r.revenue, 0) ?? 0;
        const share = total > 0 ? Math.round((row.revenue / total) * 100) : 0;
        return <span className="text-muted-foreground tabular-nums">{share}%</span>;
      },
    },
  ];

  const productColumns: Column<ProductSalesRow>[] = [
    {
      key: "name",
      header: "Product",
      sortable: true,
      sort: (row) => row.name,
      cell: (row) => <span className="text-sm font-medium">{row.name}</span>,
    },
    {
      key: "quantity",
      header: "Sold",
      numeric: true,
      sortable: true,
      sort: (row) => row.quantity,
      cell: (row) => formatNumber(row.quantity),
    },
    {
      key: "revenue",
      header: "Revenue",
      numeric: true,
      sortable: true,
      sort: (row) => row.revenue,
      cell: (row) => <span className="font-semibold">{formatIDR(row.revenue)}</span>,
    },
  ];

  const cashierColumns: Column<CashierSalesRow>[] = [
    {
      key: "name",
      header: "Cashier",
      sortable: true,
      sort: (row) => row.cashierName,
      cell: (row) => <span className="text-sm font-medium">{row.cashierName}</span>,
    },
    {
      key: "transactions",
      header: "Sales",
      numeric: true,
      sortable: true,
      sort: (row) => row.transactions,
      cell: (row) => formatNumber(row.transactions),
    },
    {
      key: "items",
      header: "Items",
      numeric: true,
      sortable: true,
      sort: (row) => row.itemsSold,
      cell: (row) => formatNumber(row.itemsSold),
    },
    {
      key: "average",
      header: "Average",
      numeric: true,
      sortable: true,
      sort: (row) => row.averageOrderValue,
      cell: (row) => formatIDR(row.averageOrderValue),
    },
    {
      key: "revenue",
      header: "Revenue",
      numeric: true,
      sortable: true,
      sort: (row) => row.revenue,
      cell: (row) => <span className="font-semibold">{formatIDR(row.revenue)}</span>,
    },
  ];

  function exportCsv() {
    if (!report) return;

    downloadCsv(`moka-sales-${ordered.from}-to-${ordered.to}.csv`, [
      ["Moka Cafe sales report"],
      ["From", ordered.from, "To", ordered.to],
      [],
      ["Summary"],
      ["Revenue", report.kpi.revenue],
      ["Transactions", report.kpi.transactions],
      ["Average order", report.kpi.averageOrderValue],
      ["Items sold", report.kpi.itemsSold],
      [],
      ["Previous period revenue", report.previousKpi.revenue],
      [],
      ["By category"],
      ["Category", "Revenue", "Items sold"],
      ...report.byCategory.map((row) => [row.categoryName, row.revenue, row.itemsSold]),
      [],
      ["Top products"],
      ["Product", "Quantity", "Revenue"],
      ...report.topProducts.map((row) => [row.name, row.quantity, row.revenue]),
      [],
      ["By cashier"],
      ["Cashier", "Transactions", "Items sold", "Average order", "Revenue"],
      ...report.byCashier.map((row) => [
        row.cashierName,
        row.transactions,
        row.itemsSold,
        row.averageOrderValue,
        row.revenue,
      ]),
      [],
      ["Payment mix"],
      ["Method", "Count", "Total", "Share"],
      ...report.paymentBreakdown.map((row) => [
        PAYMENT_LABEL[row.method],
        row.count,
        row.total,
        `${Math.round(row.share * 100)}%`,
      ]),
    ]);

    toast({ title: "Report exported", variant: "success" });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description={
          report
            ? `${formatDate(ordered.from)} to ${formatDate(ordered.to)} · ${formatNumber(
                report.kpi.transactions,
              )} sales`
            : "Sales across the selected period"
        }
        actionLabel="Export CSV"
        actionIcon={Download}
        onAction={exportCsv}
        actionDisabled={!report}
        secondary={
          <Button variant="outline" onClick={() => window.print()} disabled={!report}>
            <Printer className="size-4" aria-hidden />
            Print
          </Button>
        }
      />

      <RangePicker
        preset={activePreset}
        from={ordered.from}
        to={ordered.to}
        onPreset={applyPreset}
        onChange={onDateChange}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {isLoading && !report ? (
        <ReportSkeleton />
      ) : report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Revenue"
              value={formatIDR(report.kpi.revenue)}
              delta={delta(report.kpi.revenue, report.previousKpi.revenue)}
            />
            <KpiCard
              label="Transactions"
              value={formatNumber(report.kpi.transactions)}
              delta={delta(report.kpi.transactions, report.previousKpi.transactions)}
            />
            <KpiCard
              label="Average order"
              value={formatIDR(report.kpi.averageOrderValue)}
              delta={delta(report.kpi.averageOrderValue, report.previousKpi.averageOrderValue)}
            />
            <KpiCard
              label="Items sold"
              value={formatNumber(report.kpi.itemsSold)}
              delta={delta(report.kpi.itemsSold, report.previousKpi.itemsSold)}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <SectionCard
              title={report.trendBucket === "month" ? "Revenue per month" : "Revenue per day"}
              description={
                report.trendBucket === "month"
                  ? "Each bar is scaled to the best month in the period"
                  : "Each bar is scaled to the best day in the period"
              }
              className="lg:col-span-2"
            >
              <TrendBars report={report} bucket={report.trendBucket} />
            </SectionCard>

            <SectionCard title="Payment mix" description="Share of revenue in the period">
              <PaymentMix report={report} />
            </SectionCard>
          </div>

          <SectionCard title="Revenue by category" description="Where the money came from">
            <div className="p-5">
              <DataTable
                columns={categoryColumns}
                rows={report.byCategory}
                rowKey={(row) => row.categoryId}
              />
            </div>
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Top products" description="Best sellers by revenue">
              <div className="p-5">
                <DataTable
                  columns={productColumns}
                  rows={report.topProducts}
                  rowKey={(row) => row.productId}
                  emptyTitle="No sales in this period"
                  emptyDescription="Nothing sold between these dates."
                />
              </div>
            </SectionCard>

            <SectionCard title="Cashier performance" description="Takings per cashier">
              <div className="p-5">
                <DataTable
                  columns={cashierColumns}
                  rows={report.byCashier}
                  rowKey={(row) => row.cashierId}
                  emptyTitle="No sales in this period"
                  emptyDescription="Nothing sold between these dates."
                />
              </div>
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RangePicker({
  preset,
  from,
  to,
  onPreset,
  onChange,
}: {
  preset: Preset;
  from: string;
  to: string;
  onPreset: (preset: Exclude<Preset, "custom">) => void;
  onChange: (field: "from" | "to", value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      <div className="space-y-2">
        <Label htmlFor="report-from">From</Label>
        <Input
          id="report-from"
          type="date"
          value={from}
          max={to}
          onChange={(event) => onChange("from", event.target.value)}
          className="w-40"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="report-to">To</Label>
        <Input
          id="report-to"
          type="date"
          value={to}
          min={from}
          onChange={(event) => onChange("to", event.target.value)}
          className="w-40"
        />
      </div>

      <div className="flex flex-wrap gap-2 pb-0.5">
        {PRESETS.map((option) => (
          <Button
            key={option.key}
            size="sm"
            variant={preset === option.key ? "default" : "outline"}
            onClick={() => onPreset(option.key)}
          >
            {option.label}
          </Button>
        ))}
        {preset === "custom" ? <Badge variant="outline">Custom range</Badge> : null}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta: change,
}: {
  label: string;
  value: string;
  delta: number | null;
}) {
  return (
    <SectionCard title={label}>
      <div className="px-5 py-4">
        <p className="text-xl font-bold tracking-tight tabular-nums">{value}</p>
        <DeltaTag value={change} />
      </div>
    </SectionCard>
  );
}

/**
 * A change with no comparable previous figure is shown as "no data" rather than
 * as zero growth, which would read as a collapse.
 */
function DeltaTag({ value }: { value: number | null }) {
  if (value === null) {
    return <p className="mt-0.5 text-xs text-muted-foreground">No comparable period</p>;
  }

  if (value === 0) {
    return <p className="mt-0.5 text-xs text-muted-foreground">Level with the previous period</p>;
  }

  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <p
      className={`mt-0.5 inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
        up ? "text-primary" : "text-destructive"
      }`}
    >
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : ""}
      {value}% vs previous period
    </p>
  );
}

function TrendBars({ report, bucket }: { report: SalesReport; bucket: TrendBucket }) {
  if (report.trend.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-xs text-muted-foreground">
        No sales in this period.
      </p>
    );
  }

  /**
   * A month bucket carries `yyyy-mm`, which `formatDate` would pin to the first
   * of the month and render as "1 Okt 2026". The key decides the label.
   */
  const label = bucket === "month" ? formatMonth : formatDate;

  const max = Math.max(...report.trend.map((point) => point.revenue), 1);

  return (
    <ul className="space-y-3 p-5">
      {report.trend.map((point) => {
        const pct = Math.round((point.revenue / max) * 100);

        return (
          <li key={point.date} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium">{label(point.date)}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatIDR(point.revenue)}
              </span>
            </div>
            <Progress value={pct} aria-label={`${pct}% of the best ${bucket}`} />
            <p className="text-[11px] text-muted-foreground">
              {formatNumber(point.transactions)} transactions
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function PaymentMix({ report }: { report: SalesReport }) {
  if (report.paymentBreakdown.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-xs text-muted-foreground">
        No payments recorded in this period.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {report.paymentBreakdown.map((row) => (
        <li key={row.method} className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{PAYMENT_LABEL[row.method]}</p>
            <p className="text-xs text-muted-foreground">
              {formatNumber(row.count)} sales · {Math.round(row.share * 100)}%
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums">
            {formatIDR(row.total)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-24 rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="h-72 rounded-xl border bg-muted/40" />
      <span className="sr-only">Loading report</span>
    </div>
  );
}