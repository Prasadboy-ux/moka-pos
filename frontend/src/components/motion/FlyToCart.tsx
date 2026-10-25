"use client";

import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";

export interface Flight {
  id: number;
  image: string;
  from: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  to: {
    x: number;
    y: number;
  };
}

interface FlyToCartProps {
  flight: Flight | null;
  onComplete: () => void;
}

export function FlyToCart({ flight, onComplete }: FlyToCartProps) {
  const reduce = useReducedMotion();

  /**
   * The reduce guard also lives here, not just at the call site: a future
   * consumer must never have to remember to check before launching. Rendered
   * state just stays set, which is harmless for a single-flight hook — the next
   * `launch()` overwrites it.
   */
  if (!flight || reduce || typeof document === "undefined") return null;

  return createPortal(
    <motion.img
      key={flight.id}
      src={flight.image}
      alt=""
      aria-hidden
      initial={{
        x: flight.from.x,
        y: flight.from.y,
        scale: 1,
        opacity: 0.92,
        borderRadius: 12,
      }}
      animate={{
        x: flight.to.x - flight.from.width / 2,
        y: flight.to.y - flight.from.height / 2,
        scale: 0.14,
        opacity: 0,
        borderRadius: 999,
      }}
      transition={{ duration: DURATION.flight, ease: EASE_OUT }}
      onAnimationComplete={onComplete}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: flight.from.width,
        height: flight.from.height,
        transformOrigin: "center",
        pointerEvents: "none",
        zIndex: 80,
        objectFit: "cover",
      }}
    />,
    document.body,
  );
}
