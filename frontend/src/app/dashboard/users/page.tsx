import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = {
  title: "Users",
};

export default function UsersPage() {
  return (
    <PagePlaceholder
      title="User management"
      description="Cashier and administrator accounts, role assignment, and activation status."
      icon={Users}
      milestone="Milestone 3"
    />
  );
}