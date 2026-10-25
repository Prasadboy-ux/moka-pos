import Link from "next/link";
import { ArrowRight, Package, ShoppingCart, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard } from "@/components/dashboard/StatCard";
import { formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import type { Order } from "@/types/pos";

export function RecentOrdersTable({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No transactions yet"
        description="Once a cashier completes a sale it will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {/* A caption names the table for screen readers; column headers alone
            announce as an anonymous grid of cells. */}
        <caption className="sr-only">Recent transactions</caption>
        <thead>
          <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <th scope="col" className="px-5 py-3 font-medium">
              Receipt
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Time
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Cashier
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Items
            </th>
            <th scope="col" className="px-5 py-3 text-right font-medium">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const itemCount = order.lines.reduce((n, l) => n + l.qty, 0);
            const voided = order.status === "voided";

            return (
              <tr key={order.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    {order.receiptNo}
                    {voided ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Voided
                      </Badge>
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">
                  {formatDateTime(order.createdAt)}
                </td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">
                  {order.cashierName}
                </td>
                <td className="px-3 py-3 text-right text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                  {formatNumber(itemCount)}
                </td>
                <td
                  className={
                    voided
                      ? "px-5 py-3 text-right font-semibold whitespace-nowrap tabular-nums text-muted-foreground line-through"
                      : "px-5 py-3 text-right font-semibold whitespace-nowrap tabular-nums"
                  }
                >
                  {formatIDR(order.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LowStockList({
  items,
}: {
  items: Array<{
    id: string;
    name: string;
    kind: "ingredient" | "product";
    stock: number;
    minStock: number;
    unit: string;
  }>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Stock levels are healthy"
        description="Nothing has fallen to its minimum level."
      />
    );
  }

  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 px-5 py-3">
          <TriangleAlert
            className="size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {item.kind === "ingredient" ? "Ingredient" : "Product"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum {formatNumber(item.minStock)} {item.unit}
            </p>
          </div>
          <Badge variant="destructive" className="shrink-0 tabular-nums">
            {formatNumber(item.stock)} {item.unit}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function SeeAllLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href={href}>
        {children}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Button>
  );
}

export { SectionCard };