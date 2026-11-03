"use client";

import { motion } from "motion/react";
import {
  Banknote,
  CreditCard,
  Package,
  QrCode,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, StatCard } from "@/components/dashboard/StatCard";
import {
  LowStockList,
  RecentOrdersTable,
  SeeAllLink,
  SectionCard,
} from "@/components/dashboard/OverviewWidgets";
import { PageHeader } from "@/components/page-header";
import { useAsync } from "@/hooks/useAsync";
import { getAdminDashboard, type DashboardSummary } from "@/lib/repositories/read-models";
import {
  formatIDR,
  formatNumber,
  formatWeekdayDay,
} from "@/lib/format";
import { fadeUp, stagger } from "@/lib/motion";
import { PAYMENT_LABEL } from "@/types/pos";

/* Same glyphs the checkout dialog uses, so `credit` reads as a card everywhere. */
const METHOD_ICON = {
  cash: Banknote,
  qris: QrCode,
  debit: Wallet,
  credit: CreditCard,
} as const;

function TrendBars({ summary }: { summary: DashboardSummary }) {
  const max = Math.max(...summary.trend.map((p) => p.revenue), 1);

  return (
    <motion.ul
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-3 p-5"
    >
      {summary.trend.map((point) => {
        const pct = Math.round((point.revenue / max) * 100);

        return (
          <motion.li key={point.date} variants={fadeUp} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium">{formatWeekdayDay(point.date)}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatIDR(point.revenue)}
              </span>
            </div>
            <Progress value={pct} aria-label={`${pct}% of the busiest day`} />
            <p className="text-[11px] text-muted-foreground">
              {formatNumber(point.transactions)} transactions
            </p>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

function PaymentMix({ summary }: { summary: DashboardSummary }) {
  if (summary.paymentBreakdown.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No payments yet"
        description="Today's payments will appear here once a sale is rung up."
      />
    );
  }

  return (
    <motion.ul
      variants={stagger}
      initial="hidden"
      animate="show"
      className="divide-y"
    >
      {summary.paymentBreakdown.map((row) => {
        const Icon = METHOD_ICON[row.method];
        const sharePct = Math.round(row.share * 100);

        return (
          <motion.li
            key={row.method}
            variants={fadeUp}
            className="flex items-center gap-3 px-5 py-3"
          >
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
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

export function AdminOverview() {
  const {
    data: summary,
    error,
    isLoading,
    reload,
  } = useAsync(getAdminDashboard);

  if (error && !summary) {
    return (
      <Alert variant="destructive" className="mx-auto mt-16 max-w-md">
        <AlertTitle>Could not load the dashboard</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !summary) {
    return (
      <div className="space-y-5" aria-busy>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-72 w-full rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        <span className="sr-only">Loading dashboard</span>
      </div>
    );
  }

  const { kpi } = summary;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      <PageHeader
        title="Overview"
        description="What the counter, drawer, and shelf look like right now"
      />

      <motion.section
        variants={stagger}
        aria-label="Today's performance"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <motion.div variants={fadeUp}>
          <StatCard
            label="Revenue today"
            value={formatIDR(kpi.revenue)}
            countUp={kpi.revenue}
            hint={`${formatNumber(kpi.transactions)} transactions`}
            icon={TrendingUp}
            tone="brand"
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard
            label="Average order"
            value={formatIDR(kpi.averageOrderValue)}
            countUp={kpi.averageOrderValue}
            hint="Per transaction today"
            icon={Wallet}
            tone="accent"
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard
            label="Items sold"
            value={formatNumber(kpi.itemsSold)}
            countUp={kpi.itemsSold}
            format={formatNumber}
            hint="Across all categories"
            icon={ShoppingBag}
            tone="neutral"
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <StatCard
            label="Low stock"
            value={formatNumber(summary.lowStock.length)}
            countUp={summary.lowStock.length}
            format={formatNumber}
            hint={
              summary.lowStock.length > 0
                ? "Items need restocking"
                : "Stock levels are healthy"
            }
            icon={Package}
            tone={summary.lowStock.length > 0 ? "warn" : "neutral"}
          />
        </motion.div>
      </motion.section>

      <motion.div
        variants={stagger}
        className="grid items-start gap-5 lg:grid-cols-3"
      >
        <div className="space-y-5 lg:col-span-2">
          <motion.div variants={fadeUp}>
            <SectionCard title="Last 7 days" description="Revenue per day">
              <TrendBars summary={summary} />
            </SectionCard>
          </motion.div>

          <motion.div variants={fadeUp}>
            <SectionCard
              title="Recent transactions"
              description="Latest sales across all cashiers"
              action={<SeeAllLink href="/dashboard/reports">Reports</SeeAllLink>}
            >
              <RecentOrdersTable orders={summary.recentOrders} />
            </SectionCard>
          </motion.div>
        </div>

        <div className="space-y-5">
          <motion.div variants={fadeUp}>
            <SectionCard title="Payment mix" description="Today by method">
              <PaymentMix summary={summary} />
            </SectionCard>
          </motion.div>

          <motion.div variants={fadeUp}>
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
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}