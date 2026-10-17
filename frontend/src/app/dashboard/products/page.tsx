import type { Metadata } from "next";
import { ProductsScreen } from "@/components/products/ProductsScreen";

export const metadata: Metadata = {
  title: "Products",
  description: "Menu items, categories, pricing, and per-product recipes",
};

export default function ProductsPage() {
  return <ProductsScreen />;
}