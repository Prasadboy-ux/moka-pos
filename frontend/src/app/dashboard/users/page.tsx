import type { Metadata } from "next";
import { UsersScreen } from "@/components/users/UsersScreen";

export const metadata: Metadata = {
  title: "Users",
  description: "Cashier and administrator accounts, roles, and activation status",
};

export default function UsersPage() {
  return <UsersScreen />;
}