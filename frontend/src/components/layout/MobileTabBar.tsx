"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { isNavItemActive } from "@/lib/access";
import { navForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

/** Slots before the "More" button; five targets is the phone limit. */
const MAX_VISIBLE = 4;

/**
 * Persistent bottom navigation for phones.
 *
 * The sidebar is reachable behind the hamburger, but at the till the two or
 * three screens a cashier uses all day should be one tap away. Admins get the
 * four destinations marked `mobile` in `nav.ts`, plus "More", which opens the
 * full drawer.
 */
export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.session?.user ?? null);

  if (!user) return null;

  const items = navForRole(user.role);
  const visible = items.filter((item) => item.mobile).slice(0, MAX_VISIBLE);
  const showMore = items.length > visible.length;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {visible.map((item) => {
        const Icon = item.icon;
        const active = isNavItemActive(item, pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span>{item.shortLabel}</span>
          </Link>
        );
      })}

      {showMore ? (
        <button
          type="button"
          onClick={onMore}
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MoreHorizontal className="size-5" aria-hidden />
          <span>More</span>
        </button>
      ) : null}
    </nav>
  );
}
