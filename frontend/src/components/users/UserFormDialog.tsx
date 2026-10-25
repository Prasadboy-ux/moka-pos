"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { getRepositories } from "@/lib/repositories";
import type { User } from "@/types/auth";

/**
 * Create and edit for a user account.
 *
 * Password is required on create and optional on edit, where leaving it blank
 * keeps the existing one — the alternative being forcing every role change to
 * reset a password the admin does not know.
 */

const schema = z
  .object({
    name: z.string().trim().min(2, "Name is too short"),
    username: z
      .string()
      .trim()
      .min(3, "At least 3 characters")
      // No spaces or @: the username is typed at the till, often in a hurry.
      .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash, and underscore only"),
    role: z.enum(["kasir", "admin"]),
    isActive: z.boolean(),
    password: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.password.length === 0) return;
    if (values.password.length < 6) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "At least 6 characters",
      });
    }
  });

type Values = z.infer<typeof schema>;

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSaved: () => void;
}

export function UserFormDialog({ open, onOpenChange, user, onSaved }: UserFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <UserFormBody user={user} onOpenChange={onOpenChange} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function UserFormBody({
  user,
  onOpenChange,
  onSaved,
}: Omit<UserFormDialogProps, "open">) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? "",
      username: user?.username ?? "",
      role: user?.role ?? "kasir",
      isActive: user?.isActive ?? true,
      password: "",
    },
  });

  const [role, isActive] = useWatch({ control, name: ["role", "isActive"] });

  async function onSubmit(values: Values) {
    setPending(true);
    setFormError(null);

    try {
      const { users } = getRepositories();

      const payload = {
        name: values.name.trim(),
        username: values.username.trim(),
        role: values.role,
        isActive: values.isActive,
        // Blank on edit means "leave the password alone".
        ...(values.password ? { password: values.password } : {}),
      };

      if (user) {
        await users.update(user.id, payload);
      } else {
        await users.create(payload);
      }

      toast({
        title: user ? "Account updated" : "Account created",
        variant: "success",
      });
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save the account.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{user ? "Edit account" : "New account"}</DialogTitle>
        <DialogDescription>
          {user
            ? "Past orders keep this cashier's name as it was when they were issued."
            : "Cashiers can only reach the point of sale."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="user-name">Full name</Label>
          <Input
            id="user-name"
            placeholder="e.g. Dewi Lestari"
            aria-invalid={Boolean(errors.name)}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-username">Username</Label>
          <Input
            id="user-username"
            autoComplete="off"
            placeholder="e.g. kasir3"
            aria-invalid={Boolean(errors.username)}
            {...register("username")}
          />
          <FieldError message={errors.username?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-password">
            {user ? "New password" : "Password"}
          </Label>
          <div className="relative">
            <Input
              id="user-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder={user ? "Leave blank to keep the current one" : "At least 6 characters"}
              aria-invalid={Boolean(errors.password)}
              className="pr-10"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
          <FieldError message={errors.password?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-role">Role</Label>
          <Select
            value={role}
            onValueChange={(value) =>
              setValue("role", value as Values["role"], { shouldValidate: true })
            }
          >
            <SelectTrigger id="user-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kasir">Cashier</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="user-active" className="text-sm">
              Active
            </Label>
            <p className="text-xs text-muted-foreground">
              Inactive accounts cannot sign in.
            </p>
          </div>
          <Switch
            id="user-active"
            checked={isActive}
            onCheckedChange={(checked) => setValue("isActive", checked)}
          />
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {user ? "Save changes" : "Create account"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}