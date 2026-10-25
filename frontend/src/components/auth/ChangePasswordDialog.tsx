"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { sessionRepository } from "@/lib/repositories/http/commerce";

/**
 * Rotates the signed-in user's own password.
 *
 * Both roles can reach this: a cashier whose password was just reset by an
 * admin in front of everyone at the counter should be able to fix it, not file
 * a request to an admin to fix it for them.
 *
 * The strength floor mirrors the API (six characters). Failures already arrive
 * as sentences — "That is not your current password", per-field — so the form
 * surfaces whatever the server says rather than translating it.
 */

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(6, "Use at least 6 characters"),
  confirmPassword: z.string().min(1, "Repeat the new password"),
});

type Values = z.infer<typeof schema>;

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ChangePasswordBody onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordBody({
  onOpenChange,
}: Omit<ChangePasswordDialogProps, "open">) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showPasswords, setShowPasswords] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: Values) {
    if (values.newPassword !== values.confirmPassword) {
      setFormError("The two new-password fields do not match.");
      return;
    }

    setPending(true);
    setFormError(null);

    try {
      await sessionRepository.changePassword(
        values.currentPassword,
        values.newPassword,
      );

      reset();
      onOpenChange(false);
      toast({
        title: "Password updated",
        description:
          "Use the new password the next time you sign in. Your current session carries on.",
        variant: "success",
      });
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Could not change the password. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  const inputType = showPasswords ? "text" : "password";
  const toggle = (
    <button
      type="button"
      aria-pressed={showPasswords}
      aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
      onClick={() => setShowPasswords((prev) => !prev)}
      className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {showPasswords ? (
        <EyeOff className="size-4" aria-hidden />
      ) : (
        <Eye className="size-4" aria-hidden />
      )}
    </button>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>
          This account keeps its session — other devices signed in as you keep
          theirs until they sign out or the session expires.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="current-password">Current password</Label>
          <div className="flex items-center gap-2">
            <Input
              id="current-password"
              type={inputType}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.currentPassword)}
              {...register("currentPassword")}
            />
            {toggle}
          </div>
          {errors.currentPassword ? (
            <p className="text-xs text-destructive">
              {errors.currentPassword.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type={inputType}
            autoComplete="new-password"
            aria-invalid={Boolean(errors.newPassword)}
            {...register("newPassword")}
          />
          {errors.newPassword ? (
            <p className="text-xs text-destructive">
              {errors.newPassword.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Repeat new password</Label>
          <Input
            id="confirm-password"
            type={inputType}
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword)}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword ? (
            <p className="text-xs text-destructive">
              {errors.confirmPassword.message}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Change password
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
