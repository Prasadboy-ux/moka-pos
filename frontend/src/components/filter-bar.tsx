"use client"

import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "cn"

export interface FilterOption {
  value: string
  label: string
  count?: number
}

/**
 * Search box plus category chips, used at the top of the product and stock
 * screens.
 *
 * Chips carry their own counts so the filter is informative before it is used:
 * an empty category tells the user the menu is genuinely missing that drink,
 * rather than that they typed something that did not match.
 */
interface FilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  options: FilterOption[]
  active: string | null
  onActiveChange: (value: string | null) => void
  /** Renders to the right of the chips, e.g. a status select. */
  trailing?: React.ReactNode
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search",
  options,
  active,
  onActiveChange,
  trailing,
}: FilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pr-9 pl-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {trailing}
      </div>

      {options.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {options.map((option) => {
            const isActive = option.value === active;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onActiveChange(isActive ? null : option.value)}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:border-primary hover:text-foreground"
                )}
              >
                {option.label}
                {option.count !== undefined ? (
                  <span className={cn("tabular-nums", isActive ? "opacity-80" : "opacity-60")}>
                    {option.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/** Small count of rows, for screens where the total is worth stating outright. */
export function ResultCount({ shown, total }: { shown: number; total: number }) {
  if (shown === total) return null;

  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      Showing {shown} of {total}
    </p>
  )
}