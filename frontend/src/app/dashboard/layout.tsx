"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageTransition } from "@/components/motion/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
   *
   * A shell skeleton rather than a bare spinner: it matches what is about to
   * appear, so the page does not flash white → spinner → content on a cold load.
   */
  if (!hydrated || !user || !allowed) {
    return (
      <div className="flex min-h-screen flex-col md:flex-row" aria-busy>
        <div className="hidden w-64 shrink-0 border-r bg-sidebar p-3 md:block">
          <div className="h-16 px-2">
            <Skeleton className="h-9 w-36" />
          </div>
          <div className="space-y-2 pt-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-16 shrink-0 items-center justify-between border-b px-4 sm:px-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
          <div className="flex-1 space-y-5 p-4 sm:p-6">
            <Skeleton className="h-9 w-56" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
        <span className="sr-only">Checking permissions</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setMobileNavOpen(true)} />
        {/**
         * `id` matches the skip link in the root layout. The extra bottom padding
         * keeps content clear of the mobile home indicator on a notched tablet.
         */}
        <main
          id="main"
          className="flex-1 overflow-x-hidden p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <MobileSidebar
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
      />
    </div>
  );
}