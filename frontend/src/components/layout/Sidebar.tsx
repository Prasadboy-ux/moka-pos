"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { isNavItemActive } from "@/lib/access";
import { navForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.session?.user ?? null);

  if (!user) return null;

  const items = navForRole(user.role);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-[#00c4df] to-[#0f4c81]">
          <Image
            src="/brand/moka-mark.svg"
            alt="Moka Cafe logo"
            width={22}
            height={22}
            className="size-5.5"
          />
        </div>
        <div className="leading-tight">
          <p translate="no" className="text-sm font-bold tracking-tight">Moka Cafe</p>
          <p className="text-[11px] text-muted-foreground">Point of Sale</p>
        </div>
      </div>

      <Separator />

      <nav aria-label="Primary" className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}