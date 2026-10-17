"use client";

import { ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/auth";

const ROLE_OPTIONS = [
  {
    value: "kasir" as const,
    label: "Cashier",
    description: "Take orders and manage your shift",
    icon: UserRound,
  },
  {
    value: "admin" as const,
    label: "Admin",
    description: "Full access to reports, stock, and users",
    icon: ShieldCheck,
  },
];

interface RolePickerProps {
  value: Role;
  onChange: (role: Role) => void;
}

export function RolePicker({ value, onChange }: RolePickerProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 block text-sm font-medium text-foreground">
        Sign in as
      </legend>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup">
        {ROLE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;

          return (
            <label
              key={option.value}
              className={cn(
                "group relative flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 transition-[color,background-color,border-color,box-shadow]",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                isSelected
                  ? "border-primary bg-secondary shadow-sm"
                  : "border-input bg-background hover:border-primary/50 hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />

              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-muted",
                  )}
                >
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span
                  className={cn(
                    "size-4 rounded-full border-2 transition-colors",
                    isSelected
                      ? "border-primary bg-primary"
                      : "border-input bg-background",
                  )}
                  aria-hidden
                />
              </div>

              <span className="text-sm font-semibold text-foreground">
                {option.label}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {option.description}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}