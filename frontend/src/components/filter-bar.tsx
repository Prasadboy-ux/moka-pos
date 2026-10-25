"use client"

import { Search, X } from "lucide-react"
import { motion } from "motion/react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { SPRING } from "@/lib/motion"

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
  /** Shown in the field. Ends in `…` with an example, per DESIGN.md §10. */
  searchPlaceholder?: string
  /**
   * Accessible name. Kept separate from the placeholder so the ellipsis in the
   * example never becomes part of what a screen reader announces as the field.
   */
  searchLabel?: string
  options: FilterOption[]
  active: string | null
  onActiveChange: (value: string | null) => void
  /** Renders to the right of the chips, e.g. a status select. */
  trailing?: React.ReactNode
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchLabel,
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
            aria-label={searchLabel ?? searchPlaceholder}
            className="pr-10 pl-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        {trailing}
      </div>

      {options.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {options.map((option) => {
            const isActive = option.value === active

            return (
              <motion.button
                key={option.value}
                type="button"
                onClick={() => onActiveChange(isActive ? null : option.value)}
                aria-pressed={isActive}
                whileTap={{ scale: 0.97 }}
                transition={SPRING}
                className={cn(
                  /* 40px min-height matches the POS chips: same control, same
                     floor, one behaviour on both sides of the app. */
                  "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {option.label}
                {option.count !== undefined ? (
                  <span className={cn("tabular-nums", isActive ? "opacity-80" : "opacity-60")}>
                    {option.count}
                  </span>
                ) : null}
              </motion.button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}