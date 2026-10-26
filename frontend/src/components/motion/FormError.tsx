"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DURATION, EASE_OUT, collapse, shakeX } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface FormErrorProps {
  message?: string | null;
  className?: string;
  id?: string;
}

/**
 * Form-level error alert with one shared entrance across every dialog.
 *
 * The collapse keeps the error from shoving the footer around when it appears
 * and disappears; the shake gives a rejected submit the same feedback as the
 * checkout dialog. Field-level validation text stays static so typing does not
 * turn the form into a moving target.
 */
export function FormError({ message, className, id }: FormErrorProps) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.div
          key="form-error"
          id={id}
          role="alert"
          variants={collapse}
          initial="hidden"
          animate="show"
          exit="exit"
          className="overflow-hidden"
        >
          <motion.p
            key={message}
            initial={reduce ? false : { x: 0 }}
            animate={reduce ? undefined : { x: shakeX }}
            transition={{ duration: DURATION.page, ease: EASE_OUT }}
            className={cn("text-sm text-destructive", className)}
          >
            {message}
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
