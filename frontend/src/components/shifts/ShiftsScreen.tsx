"use client";

import * as React from "react";
import { Clock, TriangleAlert, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/data-table";
import { StatCard } from "@/components/dashboard/StatCard";
import { FilterBar } from "@/components/filter-bar";
import { StaggerGroup, StaggerItem } from "@/components/motion/StaggerGroup";
import { PageHeader } from "@/components/page-header";
import { useAsync } from "@/hooks/useAsync";
import { formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import { getRepositories } from "@/lib/repositories";
import type { Shift } from "@/types/pos";

type StatusFilter = "all" | "open" | "closed";

/** Variance is signed money: "+" when the drawer is over, "−" when short. */
function signedIDR(value: number): string {
  if (value === 0) return formatIDR(0);
  return `${value > 0 ? "+" : "−"}${formatIDR(Math.abs(value))}`;
}

/**
 * The drawer reconciliation history.
 *
 * Shifts used to be visible only from the till that opened them. An admin needs
 * to answer "who was on, what should the drawer have held, and did it balance"
 * without walking to the POS and closing someone else's shift.
 */
export function ShiftsScreen() {
  const { data, error, isLoading } = useAsync(
    () => getRepositories().shifts.list(),
    [],
  );

  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");

  const shifts = React.useMemo(() => data ?? [], [data]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();

    return shifts.filter((shift) => {
      if (status !== "all" && shift.status !== status) return false;
      if (!term) return true;
      return shift.userName.toLowerCase().includes(term);
    });
  }, [shifts, search, status]);

  const openCount = shifts.filter((shift) => shift.status === "open").length;
  const closed = shifts.filter((shift) => shift.status === "closed");
  const cashTakings = closed.reduce(
    (sum, shift) => sum + (shift.cashSales ?? 0),
    0,
  );
  const netVariance = closed.reduce(
    (sum, shift) => sum + (shift.variance ?? 0),
    0,
  );

  const columns: Column<Shift>[] = [
    {
      key: "cashier",
      header: "Cashier",
      sortable: true,
      sort: (shift) => shift.userName,
      cell: (shift) => (
        <span className="text-sm font-medium">{shift.userName}</span>
      ),
    },
    {
      key: "opened",
      header: "Opened",
      sortable: true,
      sort: (shift) => shift.openedAt,
      cell: (shift) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(shift.openedAt)}
        </span>
      ),
    },
    {
      key: "closed",
      header: "Closed",
      sortable: true,
      sort: (shift) => shift.closedAt ?? "",
      cell: (shift) =>
        shift.closedAt ? (
          <span className="text-sm text-muted-foreground">
            {formatDateTime(shift.closedAt)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Still open</span>
        ),
    },
    {
      key: "float",
      header: "Opening float",
      numeric: true,
      sortable: true,
      sort: (shift) => shift.openingFloat,
      cell: (shift) => (
        <span className="text-sm tabular-nums">
          {formatIDR(shift.openingFloat)}
        </span>
      ),
    },
    {
      key: "expected",
      header: "Expected",
      numeric: true,
      sortable: true,
      sort: (shift) => shift.expectedCash ?? 0,
      cell: (shift) =>
        shift.expectedCash == null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <span className="text-sm tabular-nums">
            {formatIDR(shift.expectedCash)}
          </span>
        ),
    },
    {
      key: "counted",
      header: "Counted",
      numeric: true,
      sortable: true,
      sort: (shift) => shift.closingCounted ?? 0,
      cell: (shift) =>
        shift.closingCounted == null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <span className="text-sm tabular-nums">
            {formatIDR(shift.closingCounted)}
          </span>
        ),
    },
    {
      key: "variance",
      header: "Variance",
      numeric: true,
      sortable: true,
      sort: (shift) => shift.variance ?? 0,
      cell: (shift) => {
        if (shift.variance == null) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }

        return (
          <span
            className={
              shift.variance < 0
                ? "text-sm font-semibold tabular-nums text-destructive"
                : shift.variance > 0
                  ? "text-sm font-semibold tabular-nums text-success"
                  : "text-sm tabular-nums text-muted-foreground"
            }
          >
            {signedIDR(shift.variance)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sort: (shift) => shift.status,
      cell: (shift) =>
        shift.status === "open" ? (
          <Badge>Open</Badge>
        ) : (
          <Badge variant="secondary">Closed</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shifts"
        description={`${formatNumber(shifts.length)} shifts · ${formatNumber(
          openCount,
        )} open`}
      />

      <StaggerGroup className="space-y-5">
        <StaggerItem>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Open shifts"
              value={isLoading ? "—" : formatNumber(openCount)}
              icon={Clock}
              tone="brand"
              hint="Drawers selling right now"
            />
            <StatCard
              label="Closed shifts"
              value={isLoading ? "—" : formatNumber(closed.length)}
              icon={Wallet}
              hint="Reconciled drawers"
            />
            <StatCard
              label="Cash takings"
              value={isLoading ? "—" : formatIDR(cashTakings)}
              icon={Wallet}
              tone="accent"
              hint="Across closed shifts"
            />
            <StatCard
              label="Net variance"
              value={isLoading ? "—" : signedIDR(netVariance)}
              icon={TriangleAlert}
              tone={netVariance < 0 ? "warn" : "neutral"}
              hint={
                netVariance === 0
                  ? "Every drawer balanced"
                  : netVariance < 0
                    ? "Drawers are short"
                    : "Drawers are over"
              }
            />
          </div>
        </StaggerItem>

        <StaggerItem>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by cashier…"
            searchLabel="Search shifts by cashier"
            options={[]}
            active={null}
            onActiveChange={() => {}}
            trailing={
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as StatusFilter)}
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            }
          />
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
            rows={filtered}
            rowKey={(shift) => shift.id}
            isLoading={isLoading}
            emptyIcon={Clock}
            emptyTitle="No shifts match"
            emptyDescription="Adjust the search or status, or open a shift from the till."
            label="Shift reconciliation history"
          />
        </StaggerItem>
      </StaggerGroup>
    </div>
  );
}
