import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PosScreen } from "@/components/pos/PosScreen";

export const metadata: Metadata = {
  title: "Point of Sale",
  description: "Take orders and process payments",
};

export default function PosPage() {
  /** The screen keeps its category filter in the query string, which needs a Suspense boundary. */
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Loading menu</span>
        </div>
      }
    >
      <PosScreen />
    </Suspense>
  );
}