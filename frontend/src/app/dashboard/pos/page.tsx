import type { Metadata } from "next";
import { PosScreen } from "@/components/pos/PosScreen";

export const metadata: Metadata = {
  title: "Point of Sale",
  description: "Take orders and process payments",
};

export default function PosPage() {
  return <PosScreen />;
}