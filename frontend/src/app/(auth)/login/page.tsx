import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Moka Cafe POS",
};

export default function LoginPage() {
  return <LoginForm />;
}