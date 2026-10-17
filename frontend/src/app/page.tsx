"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthHydrated, useAuthStore } from "@/store/useAuthStore";
import { ROLE_HOME } from "@/types/auth";

export default function RootPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const user = useAuthStore((state) => state.session?.user ?? null);

  useEffect(() => {
    if (!hydrated) return;
    // Send an already-signed-in user straight to their home, so they never see
    // the login screen flash on the way back into the app.
    router.replace(user ? ROLE_HOME[user.role] : "/login");
  }, [hydrated, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">Loading Moka Cafe</span>
    </div>
  );
}