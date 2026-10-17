"use client";

import { useRouter, usePathname } from "next/navigation";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { matchNavItem } from "@/lib/access";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLE_LABEL } from "@/types/auth";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.session?.user ?? null);
  const clearSession = useAuthStore((state) => state.clearSession);

  if (!user) return null;

  const Icon = user.role === "admin" ? ShieldCheck : UserRound;
  const current = matchNavItem(pathname);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
      <div className="min-w-0" translate="no">
        <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">
          {current?.label ?? "Moka Cafe"}
        </h1>
        {current?.description ? (
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {current.description}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold leading-tight">{user.name}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
        </div>

        <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{ROLE_LABEL[user.role]}</span>
        </div>

        <Separator orientation="vertical" className="hidden h-8 sm:block" />

        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="size-4" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
          <span className="sr-only sm:hidden">Sign out</span>
        </Button>
      </div>
    </header>
  );
}