import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ProductsScreen } from "@/components/products/ProductsScreen";

export const metadata: Metadata = {
  title: "Products",
  description: "Menu items, categories, pricing, and per-product recipes",
};

export default function ProductsPage() {
  /** The screen keeps its filters in the query string, which needs a Suspense boundary. */
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Loading products</span>
        </div>
      }
    >
      <ProductsScreen />
    </Suspense>
  );
}