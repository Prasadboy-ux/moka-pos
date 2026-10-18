import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { TransactionsScreen } from "@/components/transactions/TransactionsScreen";

export const metadata: Metadata = {
  title: "Transactions",
  description: "Search, reprint, and send every sale receipt",
};

export default function TransactionsPage() {
  /**
   * The screen keeps its filters in the query string, and Next.js requires a
   * Suspense boundary above anything calling useSearchParams.
   */
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Loading transactions</span>
        </div>
      }
    >
      <TransactionsScreen />
    </Suspense>
  );
}