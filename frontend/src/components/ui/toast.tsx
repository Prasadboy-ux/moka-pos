"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react"

/**
 * Toasts for write feedback: "Product saved", "Could not remove that category".
 *
 * Written against React rather than Radix's Toast because the app only needs
 * one thing from it: a short, non-blocking confirmation after a save or a
 * failure, announced politely to screen readers. The live region below is the
 * accessibility story; Radix would add a focus-managed queue for a case this
 * app does not have.
 */

export type ToastVariant = "default" | "success" | "destructive"

export interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
  /** Overrides the 4s default. Errors linger longer because they need reading. */
  durationMs?: number
}

/** Variant is resolved at creation, so a rendered toast always has one. */
interface ToastItem extends Omit<ToastOptions, "variant"> {
  id: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

/** Enough to cover a burst of writes without stacking off the top of the screen. */
const TOAST_LIMIT = 3

const VARIANT_ICON: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  destructive: TriangleAlert,
}

let counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = React.useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = React.useCallback(
    (options: ToastOptions) => {
      counter += 1
      const id = `toast-${counter}`
      const variant = options.variant ?? "default"

      setItems((current) => [...current.slice(-(TOAST_LIMIT - 1)), { ...options, id, variant }])

      const duration = options.durationMs ?? (variant === "destructive" ? 7000 : 4000)
      timers.current.set(id, setTimeout(() => dismiss(id), duration))
    },
    [dismiss]
  )

  // Clearing on unmount stops a dismissed screen from holding timers open.
  React.useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

/**
 * Safe to call from anywhere, including an error boundary. Returns the no-op
 * rather than throwing when no provider is mounted, because a missing toast
 * should never be the reason a screen breaks.
 */
export function useToast(): ToastContextValue {
  return React.useContext(ToastContext) ?? { toast: () => {} }
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[]
  onDismiss: (id: string) => void
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    >
      {items.map((item) => {
        const Icon = VARIANT_ICON[item.variant]

        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-2 fade-in-0",
              item.variant === "destructive" && "border-destructive/40 bg-destructive/5"
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                item.variant === "destructive"
                  ? "text-destructive"
                  : item.variant === "success"
                    ? "text-primary"
                    : "text-muted-foreground"
              )}
            />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label="Dismiss notification"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}