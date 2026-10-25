import type { Transition, Variants } from "motion/react";

/**
 * Shared motion language.
 *
 * One easing curve and one spring, so every entrance in the app reads as the
 * same product rather than a pile of individually tuned animations. Values are
 * deliberately short: a till is a working tool, and an animation that delays the
 * next tap is a cost, not a flourish.
 *
 * Import durations from `DURATION` — never hardcode a number at a call site, or
 * the app drifts back to a pile of individually tuned animations.
 */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const DURATION = {
  /** Micro-feedback: toast exits, "just added" overlays, collapse exits. */
  fast: 0.16,
  /** Content swaps that take turns: header label, checkout method panels. */
  swap: 0.18,
  /** Default section-level entrance and height/opacity reveals. */
  base: 0.24,
  /** Whole-screen entrances: routed page, shift gate, count-up figures. */
  page: 0.34,
  /** The fly-to-cart flight: it travels the whole screen, so it lingers. */
  flight: 0.48,
} as const;

export const SPRING: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.7,
};

export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 30,
  mass: 0.9,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.page, ease: EASE_OUT },
  },
};

export const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION.base, ease: EASE_OUT },
  },
};

/**
 * Height/opacity reveal used by collapsible panels and inline error alerts.
 *
 * `transition` carries per-value entries rather than one flat duration so the
 * entrance choreography (opacity first, then geometry) — and the collapse back
 * — stays consistent wherever the variant is reused. A `marginTop` reset rides
 * along so the collapsed state can rest against eager parent spacing.
 */
export const collapse: Variants = {
  hidden: { height: 0, opacity: 0, marginTop: 0 },
  show: {
    height: "auto",
    opacity: 1,
    marginTop: 0,
    transition: {
      height: { duration: DURATION.base, ease: EASE_OUT },
      opacity: { duration: DURATION.fast, ease: EASE_OUT },
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    marginTop: 0,
    transition: {
      height: { duration: DURATION.fast, ease: EASE_OUT },
      opacity: { duration: DURATION.fast, ease: EASE_OUT },
    },
  },
};

export const shakeX = [0, -6, 6, -4, 4, 0];
