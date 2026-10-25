"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Separator } from "@/components/ui/separator";
import { isNavItemActive } from "@/lib/access";
import { navForRole } from "@/lib/nav";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

interface SidebarContentProps {
  onNavigate?: () => void;
  activeLayoutId?: string;
}

export function SidebarContent({
  onNavigate,
  activeLayoutId = "sidebar-active",
}: SidebarContentProps) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.session?.user ?? null);

  if (!user) return null;

  const items = navForRole(user.role);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-brand-cyan to-brand-navy">
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
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                isActive
                  ? "text-sidebar-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              {isActive ? (
                <motion.span
                  layoutId={activeLayoutId}
                  transition={SPRING}
                  className="absolute inset-0 rounded-lg bg-sidebar-primary shadow-sm"
                  aria-hidden
                />
              ) : null}
              <motion.span
                animate={{ scale: isActive ? 1.08 : 1 }}
                transition={SPRING}
                className="relative flex"
              >
                <Icon className="size-4" aria-hidden />
              </motion.span>
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
      <SidebarContent />
    </aside>
  );
}
