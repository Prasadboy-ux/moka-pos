"use client";

import { MotionConfig } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";

/**
 * One place to set the motion contract for the whole app.
 *
 * `reducedMotion="user"` is the important line: when the operating system asks
 * for less motion, Motion skips transform, scale, and layout animations while
 * still allowing opacity fades, so nothing ever gets stuck half-rendered. The
 * CSS rule in globals.css covers the transitions Motion does not own.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      {children}
    </MotionConfig>
  );
}
