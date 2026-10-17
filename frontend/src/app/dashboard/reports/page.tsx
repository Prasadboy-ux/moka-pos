import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ReportsScreen } from "@/components/reports/ReportsScreen";

export const metadata: Metadata = {
  title: "Reports",
  description: "Revenue trends, sales by category, top products, and cashier performance",
};

export default function ReportsPage() {
  /**
   * The screen reads its date range from the query string, and Next.js requires
   * a Suspense boundary above anything calling useSearchParams.
   */
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Loading report</span>
        </div>
      }
    >
      <ReportsScreen />
    </Suspense>
  );
}