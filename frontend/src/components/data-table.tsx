"use client"

import * as React from "react"
import { ArrowUp, ChevronLeft, ChevronRight, SearchX, type LucideIcon } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/dashboard/StatCard"
import { DURATION, EASE_OUT, LIST_STAGGER } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import { motion } from "motion/react"

export interface Column<T> {
  key: string
  header: string
  /** Omit for a column that cannot be sorted, such as an actions menu. */
  sortable?: boolean
  /** The value sorting compares. Required whenever `sortable` is set. */
  sort?: (row: T) => string | number
  /** Right-aligns and sets the numeric font for figures. */
  numeric?: boolean
  className?: string
  cell: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  isLoading?: boolean
  /** Rows of skeleton to draw while loading, so the layout does not jump. */
  skeletonRows?: number
  pageSize?: number
  emptyTitle?: string
  emptyDescription?: string
  /** Pass a lucide icon to replace the default empty-state glyph. */
  emptyIcon?: LucideIcon
  /** Accessible name for the table, announced in place of column headers alone. */
  label?: string
  /**
   * Optional whole-row click target. Deliberately not the default: a clickable
   * row is not reachable by keyboard, so prefer a real button inside the row.
   * If used, stop propagation inside any cell holding its own control or the
   * click will fire twice.
   */
  onRowClick?: (row: T) => void
}

type SortDirection = "asc" | "desc"

/**
 * The table every admin screen uses.
 *
 * Sorting and pagination are done in the browser on purpose. The mock store
 * returns everything at once, so a server-driven table would be architecture for
 * a problem this app does not have yet — and when the API lands, both are a few
 * lines inside the repository rather than a rewrite of every screen.
 *
 * Columns are plain objects rather than generics-with-jsx: a sortable column
 * needs its sort value declared once (`sortValue`), which is where a mistake
 * would otherwise hide.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  skeletonRows = 6,
  pageSize = 10,
  emptyTitle = "Nothing to show",
  emptyDescription = "There is no data for the current filters.",
  emptyIcon,
  label,
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [page, setPage] = React.useState(0);

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows;

    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sort) return rows;

    const factor = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sort!(a);
      const right = column.sort!(b);

      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * factor;
      }
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [rows, sortKey, sortDirection, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  // A filter that shrinks the list can leave the current page out of range.
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function resetToFirstPage() {
    setPage(0);
  }

  if (isLoading) {
    return <TableSkeleton columns={columns} rows={skeletonRows} />;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border">
        <EmptyState
          icon={emptyIcon ?? SearchX}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border">
        <Table aria-label={label}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => {
                const isSorted = sortKey === column.key;

                return (
                  <TableHead
                    key={column.key}
                    className={cn(column.numeric && "text-right", column.className)}
                    aria-sort={
                      isSorted
                        ? sortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => {
                          toggleSort(column.key)
                          resetToFirstPage()
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          column.numeric && "flex-row-reverse"
                        )}
                      >
                        {column.header}
                        {/*
                          One ArrowUp that rotates for descending order — the
                          sorted glyph between directions instead of a swap,
                          so the change reads as a rotation of the same data.
                        */}
                        <motion.span
                          aria-hidden
                          animate={{ rotate: isSorted && sortDirection === "desc" ? 180 : 0 }}
                          transition={{ duration: DURATION.swap, ease: EASE_OUT }}
                          className="grid size-3 place-items-center"
                        >
                          <ArrowUp className="size-3" />
                        </motion.span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {visible.map((row, index) => {
              /**
               * The composite key remounts the page's rows when sorting or
               * paging, so the entrance plays for those interactions too —
               * without it, rows that survive a sort would never animate.
               */
              const repeatKey = `${rowKey(row)}@${safePage}:${sortKey ?? "none"}:${sortDirection}`

              return (
                <motion.tr
                  key={repeatKey}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  data-slot="table-row"
                  className={cn(
                    "border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted",
                    onRowClick && "cursor-pointer",
                  )}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: DURATION.base,
                    ease: EASE_OUT,
                    delay: Math.min(
                      index * LIST_STAGGER.step,
                      LIST_STAGGER.max,
                    ),
                  }}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(column.numeric && "text-right tabular-nums")}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </motion.tr>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            Showing {formatNumber(safePage * pageSize + 1)}–
            {formatNumber(Math.min((safePage + 1) * pageSize, sorted.length))} of{" "}
            {formatNumber(sorted.length)}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="size-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Page {safePage + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="size-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TableSkeleton<T>({ columns, rows }: { columns: Column<T>[]; rows: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            {/* Same treatment as the live header (transparent, bordered) so
                swapping out of the skeleton does not flash a grey strip. */}
            <tr className="border-b">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "h-10 px-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase",
                    column.numeric && "text-right"
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, index) => (
              <tr key={index} className="border-b last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-3">
                    <Skeleton className={cn("h-4", column.numeric ? "w-16 ml-auto" : "w-28")} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">Loading rows</span>
    </div>
  )
}