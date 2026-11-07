import type { Metadata } from "next";
import { SecurityScreen } from "@/components/security/SecurityScreen";

export const metadata: Metadata = {
  title: "Security",
  description: "Two-factor authentication and recovery codes",
};

export default function SecurityPage() {
  return <SecurityScreen />;
}
