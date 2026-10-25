"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { KeyRound, LogOut, Menu, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { matchNavItem } from "@/lib/access";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLE_LABEL } from "@/types/auth";

export function Header({ onOpenNav }: { onOpenNav?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.session?.user ?? null);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [changingPassword, setChangingPassword] = useState(false);

  if (!user) return null;

  const Icon = user.role === "admin" ? ShieldCheck : UserRound;
  const current = matchNavItem(pathname);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
      {/**
       * Chrome, not the page heading. PageHeader owns the real `<h1>` for a
       * screen; repeating it here at the same size stacked a duplicate title
       * a few pixels above it. The header keeps the route name as muted
       * context for screens that have no PageHeader (the till).
       */}
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={onOpenNav}
        >
          <Menu className="size-5" aria-hidden />
        </Button>

        <div className="min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DURATION.swap, ease: EASE_OUT }}
          >
            <p
              translate="no"
              className="truncate text-sm font-semibold tracking-tight text-muted-foreground sm:text-base"
            >
              {current?.label ?? "Moka Cafe"}
            </p>
            {current?.description ? (
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {current.description}
              </p>
            ) : null}
          </motion.div>
        </AnimatePresence>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold leading-tight">{user.name}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
        </div>

        {/**
         * The avatar is the account menu, not a status chip: "who am I" and
         * "what can I do about it" sit in the same place, on every screen.
         */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Account: ${user.name}`}
            >
              <Icon className="size-4" aria-hidden />
              <span className="sr-only">{ROLE_LABEL[user.role]}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setChangingPassword(true)}>
              <KeyRound className="size-4" aria-hidden />
              Change password
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="hidden h-8 sm:block" />

        <Button variant="ghost" onClick={handleLogout}>
          <LogOut className="size-4" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
          <span className="sr-only sm:hidden">Sign out</span>
        </Button>
      </div>

      <ChangePasswordDialog
        open={changingPassword}
        onOpenChange={setChangingPassword}
      />
    </header>
  );
}