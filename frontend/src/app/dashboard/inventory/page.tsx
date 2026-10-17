import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { StockScreen } from "@/components/stock/StockScreen";

export const metadata: Metadata = {
  title: "Inventory",
  description: "Ingredient levels, counted stock, and the movement audit trail",
};

export default function InventoryPage() {
  /** The screen keeps its tab in the query string, which needs a Suspense boundary. */
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Loading stock</span>
        </div>
      }
    >
      <StockScreen />
    </Suspense>
  );
}