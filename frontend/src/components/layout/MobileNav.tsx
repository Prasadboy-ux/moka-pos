"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive } from "@/lib/access";
import { navForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

/** Bottom tab bar shown on small screens, mirroring the sidebar. */
export function MobileNav() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.session?.user ?? null);

  if (!user) return null;

  const items = navForRole(user.role);
  if (items.length <= 1) return null;

  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 items-stretch justify-around border-t bg-background md:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = isNavItemActive(item, pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-md px-1 py-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span className="truncate">{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}