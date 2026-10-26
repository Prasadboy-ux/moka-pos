"use client";

import { motion, useReducedMotion } from "motion/react";
import { DURATION } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface SuccessCheckProps {
  className?: string;
}

export function SuccessCheck({ className }: SuccessCheckProps) {
  const reduce = useReducedMotion();

  return (
    <motion.svg
      viewBox="0 0 48 48"
      className={cn("size-11 text-success", className)}
      initial={reduce ? false : "hidden"}
      animate="show"
      aria-hidden
    >
      <motion.circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          show: {
            pathLength: 1,
            opacity: 1,
            transition: { duration: DURATION.page },
          },
        }}
      />
      <motion.path
        d="M15 25l6 6 12-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          show: {
            pathLength: 1,
            opacity: 1,
            transition: {
              duration: DURATION.base,
              delay: DURATION.swap,
            },
          },
        }}
      />
    </motion.svg>
  );
}
