"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { motion } from "motion/react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { SPRING } from "@/lib/motion"

/**
 * Context from the Tabs root down to each trigger, carrying the live active
 * value and a layout id reserved for the sliding indicator. Same contract the
 * Sidebar's active pill uses: one element per layout id, so Motion can tween
 * the underline from the previous trigger to the next one on every switch.
 */
interface TabsActiveContextValue {
  activeValue: string | undefined
  indicatorId: string
}

const TabsActiveContext = React.createContext<TabsActiveContextValue | null>(
  null
)

function Tabs({
  value: valueProp,
  defaultValue,
  onValueChange: onValueChangeProp,
  orientation = "horizontal",
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
  orientation?: "horizontal" | "vertical"
}) {
  const [fallback, setFallback] = React.useState(defaultValue)
  const activeValue = valueProp ?? fallback
  const indicatorId = React.useId()

  const onValueChange = React.useCallback(
    (next: string) => {
      onValueChangeProp?.(next)
      if (valueProp === undefined) setFallback(next)
    },
    [onValueChangeProp, valueProp]
  )

  return (
    <TabsActiveContext.Provider value={{ activeValue, indicatorId }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        value={activeValue}
        onValueChange={onValueChange}
        className={cn(
          "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
          className
        )}
        {...props}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsActiveContext.Provider>
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const context = React.useContext(TabsActiveContext)
  const active = context !== null && context.activeValue === value

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-[color,box-shadow] group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
        className
      )}
      {...props}
    >
      {children}
      {/**
       * Sliding indicator for the `line` variant. Only the active trigger owns
       * the shared layout id, so Motion tweens it across triggers on switching
       * instead of mounting a fresh underline. The `default` variant keeps its
       * styled pill; the indicator is hidden there for now.
       */}
      {active && context ? (
        <motion.span
          layoutId={context.indicatorId}
          transition={SPRING}
          aria-hidden
          className={cn(
            "pointer-events-none absolute z-10 hidden rounded-full bg-foreground",
            "group-data-[variant=line]/tabs-list:block",
            "group-data-[orientation=horizontal]/tabs:inset-x-0 group-data-[orientation=horizontal]/tabs:bottom-[-5px] group-data-[orientation=horizontal]/tabs:h-0.5",
            "group-data-[orientation=vertical]/tabs:inset-y-0 group-data-[orientation=vertical]/tabs:-right-1 group-data-[orientation=vertical]/tabs:w-0.5"
          )}
        />
      ) : null}
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
