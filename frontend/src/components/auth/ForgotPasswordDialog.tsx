"use client";

import { useState } from "react";
import { Check, Copy, HelpCircle, KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: ForgotPasswordDialogProps) {
  const [copied, setCopied] = useState(false);
  const supportEmail = "ops@mokacafe.com";

  function handleCopy() {
    void navigator.clipboard.writeText(supportEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </div>
          <DialogTitle className="text-xl font-bold">
            Account Recovery Guidance
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            MOKA CAFE is an integrated POS platform. Staff credential resets are
            governed by internal cafe access roles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Cashier card */}
          <div className="flex gap-3.5 rounded-xl border bg-card p-3.5 shadow-xs">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <HelpCircle className="size-4" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                For Cashiers & Baristas
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your shift supervisor or store manager can reset your password
                immediately from the <strong>Users</strong> panel in the
                Admin Dashboard.
              </p>
            </div>
          </div>

          {/* Admin card */}
          <div className="flex gap-3.5 rounded-xl border bg-card p-3.5 shadow-xs">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <ShieldAlert className="size-4" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                For Administrators
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                If you have MFA configured, use one of your single-use recovery
                codes at sign-in. Lost the device <em>and</em> the codes?
                Another admin can reset your two-factor from{" "}
                <strong>Users</strong>. If you are the only admin, the server
                operator can clear it from the backend:
              </p>
              <code className="mt-2 block rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
                npm run mfa:reset -- &lt;username&gt;
              </code>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Still stuck? Contact the cafe operations IT lead:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                  {supportEmail}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check className="mr-1 size-3 text-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 size-3" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="default"
            onClick={() => onOpenChange(false)}
          >
            Got it, return to sign in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
