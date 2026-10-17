import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = {
  title: "Inventory",
};

export default function InventoryPage() {
  return (
    <PagePlaceholder
      title="Stock management"
      description="Ingredients and packaged goods, minimum stock levels, and the full movement audit trail."
      icon={Boxes}
      milestone="Milestone 3"
    />
  );
}