import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = {
  title: "Reports",
};

export default function ReportsPage() {
  return (
    <PagePlaceholder
      title="Reports"
      description="Revenue trends, sales by category, top products, and per-cashier performance with CSV export."
      icon={BarChart3}
      milestone="Milestone 3"
    />
  );
}