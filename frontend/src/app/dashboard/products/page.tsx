import type { Metadata } from "next";
import { Package } from "lucide-react";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = {
  title: "Products",
};

export default function ProductsPage() {
  return (
    <PagePlaceholder
      title="Product management"
      description="Menu items, categories, pricing, and per-product recipes that drive ingredient usage."
      icon={Package}
      milestone="Milestone 3"
    />
  );
}