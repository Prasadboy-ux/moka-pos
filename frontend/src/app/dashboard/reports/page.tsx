import type { Metadata } from "next";
import { ReportsScreen } from "@/components/reports/ReportsScreen";

export const metadata: Metadata = {
  title: "Reports",
  description: "Revenue trends, sales by category, top products, and cashier performance",
};

export default function ReportsPage() {
  return <ReportsScreen />;
}