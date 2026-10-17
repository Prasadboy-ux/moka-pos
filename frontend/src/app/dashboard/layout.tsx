"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { canAccess, homeForPathname } from "@/lib/access";
import { useAuthHydrated, useAuthStore } from "@/store/useAuthStore";
import { ROLE_HOME } from "@/types/auth";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthHydrated();
  const user = useAuthStore((state) => state.session?.user ?? null);

  const allowed = hydrated && user ? canAccess(user.role, pathname) : false;

  useEffect(() => {
    if (!hydrated) return;

    if (!user) {
      router.replace("/login");
      return;
    }
    const blockedHome = homeForPathname(pathname, user.role);
    if (blockedHome) {
      router.replace(ROLE_HOME[user.role]);
    }
  }, [hydrated, user, pathname, router]);

  /**
   * The gate must block rendering, not just redirect. Redirecting alone still
   * paints the forbidden page for one frame before the effect runs, which
   * flashes admin content to a cashier.
   */
  if (!hydrated || !user || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Checking permissions</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 md:pb-6">
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}