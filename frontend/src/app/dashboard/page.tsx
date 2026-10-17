import type { Metadata } from "next";
import { AdminOverview } from "@/components/dashboard/AdminOverview";

export const metadata: Metadata = {
  title: "Overview",
  description: "Today's revenue, shifts, and stock alerts",
};

export default function DashboardPage() {
  return <AdminOverview />;
}