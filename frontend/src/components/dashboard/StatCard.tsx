"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { cn } from "@/lib/utils";
import { DURATION, EASE_OUT } from "@/lib/motion";

interface StatCardProps {
  label: string;
  /** The static figure; also the `title` fallback for the animated one. */
  value: string;
  /**
   * When set, the headline counts up to this number inside the card instead of
   * rendering `value` statically.
   */
  countUp?: number;
  /** Formatter for `countUp`; defaults to IDR. */
  format?: (value: number) => string;
  hint?: string;
  icon: LucideIcon;
  tone?: "brand" | "accent" | "warn" | "neutral";
}

const TONE_RING: Record<NonNullable<StatCardProps["tone"]>, string> = {
  brand: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  warn: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export function StatCard({
  label,
  value,
  countUp,
  format,
  hint,
  icon: Icon,
  tone = "neutral",
}: StatCardProps) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start gap-4 p-5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            TONE_RING[tone],
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>

        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          {/*
            `text-2xl` at the small end and a title attribute: a revenue figure
            like "Rp 128.500.000" used to clip silently at text-xl with no way
            to read the rest.
          */}
          <p
            className="mt-1 truncate text-2xl font-bold tracking-tight tabular-nums"
            title={value}
          >
            {countUp === undefined ? value : (
              <AnimatedNumber value={countUp} format={format} />
            )}
          </p>
          {hint ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

interface SectionCardProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: SectionCardProps) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  /**
   * Fades up on mount rather than appearing at full strength: these render in
   * place of lists that just emptied, and an unreasonable-looking instant swap
   * reads like the screen forgot its data.
   */
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
      className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center"
    >
      <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </motion.div>
  );
}