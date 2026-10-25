"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { SidebarContent } from "@/components/layout/Sidebar";
import { DURATION, EASE_OUT, SPRING_SOFT } from "@/lib/motion";

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION.base, ease: EASE_OUT }}
                className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] md:hidden"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content
              asChild
              forceMount
              aria-describedby={undefined}
            >
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%", transition: { duration: DURATION.base, ease: EASE_OUT } }}
                transition={SPRING_SOFT}
                className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-sidebar shadow-2xl outline-none md:hidden"
              >
                <DialogPrimitive.Title className="sr-only">
                  Navigation
                </DialogPrimitive.Title>

                <DialogPrimitive.Close
                  className="absolute top-3 right-3 z-10 flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
                  aria-label="Close navigation"
                >
                  <X className="size-5" aria-hidden />
                </DialogPrimitive.Close>

                <SidebarContent
                  onNavigate={() => onOpenChange(false)}
                  activeLayoutId="mobile-sidebar-active"
                />
              </motion.aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
