import type { Metadata } from "next";
import { StockScreen } from "@/components/stock/StockScreen";

export const metadata: Metadata = {
  title: "Inventory",
  description: "Ingredient levels, counted stock, and the movement audit trail",
};

export default function InventoryPage() {
  return <StockScreen />;
}