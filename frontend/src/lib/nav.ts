import {
  Boxes,
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types/auth";

export interface NavItem {
  label: string;
  /** Compact label for the mobile tab bar, where horizontal space is tight. */
  shortLabel: string;
  description: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    shortLabel: "Home",
    description: "Today's revenue, shifts, and stock alerts",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin"],
  },
  {
    label: "Point of Sale",
    shortLabel: "POS",
    description: "Take orders and process payments",
    href: "/dashboard/pos",
    icon: ShoppingCart,
    roles: ["kasir", "admin"],
  },
  {
    /*
     * Cashiers get this too, not just admins. Reprinting a receipt and looking
     * up what a customer paid yesterday are both things a cashier is asked to do
     * mid-shift, and gating either behind the admin role means answering the
     * question from memory.
     */
    label: "Transactions",
    shortLabel: "Sales",
    description: "Search, reprint, and send receipts",
    href: "/dashboard/transactions",
    icon: Receipt,
    roles: ["kasir", "admin"],
  },
  {
    label: "Products",
    shortLabel: "Products",
    description: "Menu items, pricing, and recipes",
    href: "/dashboard/products",
    icon: Package,
    roles: ["admin"],
  },
  {
    label: "Inventory",
    shortLabel: "Stock",
    description: "Ingredients and stock movements",
    href: "/dashboard/inventory",
    icon: Boxes,
    roles: ["admin"],
  },
  {
    label: "Reports",
    shortLabel: "Reports",
    description: "Revenue trends and sales analysis",
    href: "/dashboard/reports",
    icon: BarChart3,
    roles: ["admin"],
  },
  {
    label: "Users",
    shortLabel: "Users",
    description: "Cashier and admin accounts",
    href: "/dashboard/users",
    icon: Users,
    roles: ["admin"],
  },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}