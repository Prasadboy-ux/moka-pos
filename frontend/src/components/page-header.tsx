"use client"

import type { LucideIcon } from "lucide-react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Title, explanation, and the screen's one primary action.
 *
 * The app header already names the route, so this sits below it as the working
 * line for the screen: what it does, and the button that starts it.
 */
interface PageHeaderProps {
  title: string
  description: string
  actionLabel?: string
  actionIcon?: LucideIcon
  onAction?: () => void
  actionDisabled?: boolean
  secondary?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  actionLabel,
  actionIcon: Icon = Plus,
  onAction,
  actionDisabled = false,
  secondary,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {/* The screen's real heading; the app header shows only muted context. */}
        <h1 className="text-xl font-bold tracking-tight text-balance">{title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>

      {actionLabel && onAction ? (
        <div className="flex shrink-0 items-center gap-2">
          {secondary}
          <Button onClick={onAction} disabled={actionDisabled}>
            <Icon className="size-4" aria-hidden />
            {actionLabel}
          </Button>
        </div>
      ) : (
        secondary
      )}
    </div>
  )
}