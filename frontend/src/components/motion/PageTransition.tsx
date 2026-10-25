"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { DURATION, EASE_OUT } from "@/lib/motion";

/**
 * Fades and lifts the routed screen into place.
 *
 * Keyed on the pathname so a navigation remounts the wrapper and replays the
 * entrance. It intentionally does not use `AnimatePresence`: waiting for an
 * exit before painting the next screen would make every tab feel slower than
 * the one before it.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.page, ease: EASE_OUT }}
      className="min-h-full"
    >
      {children}
    </motion.div>
  );
}
