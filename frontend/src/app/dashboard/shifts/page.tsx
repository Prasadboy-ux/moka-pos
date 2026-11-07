import type { Metadata } from "next";
import { ShiftsScreen } from "@/components/shifts/ShiftsScreen";

export const metadata: Metadata = {
  title: "Shifts",
  description: "Drawer reconciliation and cash variance per cashier shift",
};

export default function ShiftsPage() {
  return <ShiftsScreen />;
}
