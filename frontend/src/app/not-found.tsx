"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DURATION, EASE_OUT } from "@/lib/motion";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.page, ease: EASE_OUT }}
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-brand-cyan to-brand-navy text-white shadow-lg">
        <Coffee className="size-7" aria-hidden />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.3em] text-primary uppercase">
          404
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          This page is not on the menu
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The page you are looking for does not exist or may have been moved.
        </p>
      </div>

      <Button asChild>
        <Link href="/">Back to Moka Cafe</Link>
      </Button>
    </motion.div>
  );
}