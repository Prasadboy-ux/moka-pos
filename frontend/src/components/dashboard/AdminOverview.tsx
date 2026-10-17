"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  Loader2,
  Package,
  QrCode,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  LowStockList,
  RecentOrdersTable,
  SeeAllLink,
  SectionCard,
} from "@/components/dashboard/OverviewWidgets";
import { getAdminDashboard, type DashboardSummary } from "@/services/dashboard";
import { formatIDR, formatNumber } from "@/lib/format";
import { PAYMENT_LABEL } from "@/types/pos";

const METHOD_ICON = {
  cash: Banknote,
  qris: QrCode,
  debit: Wallet,
  credit: Receipt,
} as const;

function TrendBars({ summary }: { summary: DashboardSummary }) {
  const max = Math.max(...summary.trend.map((p) => p.revenue), 1);

  return (
    <ul className="space-y-3 p-5">
      {summary.trend.map((point) => {
        const pct = Math.round((point.revenue / max) * 100);
        const day = new Date(`${point.date}T00:00:00`);

        return (
          <li key={point.date} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium">
                {new Intl.DateTimeFormat("id-ID", {
                  weekday: "short",
                  day: "numeric",
                }).format(day)}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatIDR(point.revenue)}
              </span>
            </div>
            <Progress value={pct} aria-label={`${pct}% of the busiest day`} />
            <p className="text-[11px] text-muted-foreground">
              {formatNumber(point.transactions)} transactions
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function PaymentMix({ summary }: { summary: DashboardSummary }) {
  if (summary.paymentBreakdown.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-xs text-muted-foreground">
        No payments recorded today.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {summary.paymentBreakdown.map((row) => {
        const Icon = METHOD_ICON[row.method];
        const sharePct = Math.round(row.share * 100);

        return (
          <li key={row.method} className="flex items-center gap-3 px-5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{PAYMENT_LABEL[row.method]}</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatIDR(row.total)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatNumber(row.count)} sales · {sharePct}% of today
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminOverview() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAdminDashboard()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the dashboard summary.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading dashboard</span>
      </div>
    );
  }

  const { kpi } = summary;

  return (
    <div className="space-y-5">
      <section aria-label="Today's performance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue today"
          value={formatIDR(kpi.todayRevenue)}
          hint={`${formatNumber(kpi.todayTransactions)} transactions`}
          icon={TrendingUp}
          tone="brand"
        />
        <StatCard
          label="Average order"
          value={formatIDR(kpi.averageOrderValue)}
          hint="Per transaction today"
          icon={Wallet}
          tone="accent"
        />
        <StatCard
          label="Items sold"
          value={formatNumber(kpi.itemsSold)}
          hint="Across all categories"
          icon={ShoppingBag}
          tone="neutral"
        />
        <StatCard
          label="Low stock"
          value={formatNumber(summary.lowStock.length)}
          hint={
            summary.lowStock.length > 0
              ? "Items need restocking"
              : "Stock levels are healthy"
          }
          icon={Package}
          tone={summary.lowStock.length > 0 ? "warn" : "neutral"}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard
          title="Last 7 days"
          description="Revenue per day"
          className="lg:col-span-2"
        >
          <TrendBars summary={summary} />
        </SectionCard>

        <SectionCard title="Payment mix" description="Today by method">
          <PaymentMix summary={summary} />
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard
          title="Recent transactions"
          description="Latest sales across all cashiers"
          className="lg:col-span-2"
          action={<SeeAllLink href="/dashboard/reports">Reports</SeeAllLink>}
        >
          <RecentOrdersTable orders={summary.recentOrders} />
        </SectionCard>

        <SectionCard
          title="Low stock"
          description="At or below minimum"
          action={
            summary.lowStock.length > 0 ? (
              <Badge variant="destructive">{summary.lowStock.length}</Badge>
            ) : undefined
          }
        >
          <LowStockList items={summary.lowStock} />
        </SectionCard>
      </div>
    </div>
  );
}