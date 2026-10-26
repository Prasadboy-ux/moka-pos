"use client";

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { formatIDR } from "@/lib/format";
import { DURATION, EASE_OUT } from "@/lib/motion";

interface AnimatedNumberProps {
  value: number;
  /** Formats the interpolated figure at every frame of the count-up. */
  format?: (value: number) => string;
  className?: string;
  /**
   * Count up from zero on first render. Live totals that already have a
   * meaningful value can opt out and only tween when the value changes.
   */
  animateOnMount?: boolean;
}

/**
 * Counts a headline figure up from zero (or tweens it between values) instead
 * of letting it appear at full strength. Reduced motion collapses to a plain
 * set, because even a fast tween is motion.
 */
export function AnimatedNumber({
  value,
  format = formatIDR,
  className,
  animateOnMount = true,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const raw = useMotionValue(animateOnMount ? 0 : value);
  const display = useTransform(raw, (current) => format(Math.round(current)));

  useEffect(() => {
    if (reduce) {
      raw.set(value);
      return;
    }

    const controls = animate(raw, value, {
      duration: DURATION.page,
      ease: EASE_OUT,
    });

    return () => controls.stop();
  }, [raw, reduce, value]);

  return (
    <motion.span className={className}>{display}</motion.span>
  );
}
