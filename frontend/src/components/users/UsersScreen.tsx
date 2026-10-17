"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Power, UserPlus, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { UserFormDialog } from "@/components/users/UserFormDialog";
import { useToast } from "@/components/ui/toast";
import { useAsync } from "@/hooks/useAsync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getRepositories } from "@/lib/repositories";
import { formatNumber } from "@/lib/format";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLE_LABEL, type User } from "@/types/auth";

/**
 * User management.
 *
 * Accounts are never deleted. Sales reference the cashier who took them, and a
 * deactivated account keeps resolving for those receipts while being refused at
 * the login screen — which is what "let this person go" should mean here.
 */

type RoleFilter = "all" | "admin" | "kasir";
type StatusFilter = "all" | "active" | "inactive";

async function loadUsers(): Promise<User[]> {
  return getRepositories().users.list();
}

/** Two letters from a name, which is all an avatar can usefully show. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UsersScreen() {
  const { data, error, isLoading, reload } = useAsync(loadUsers);
  const { toast } = useToast();
  const currentUser = useAuthStore((state) => state.session?.user ?? null);

  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  const [editing, setEditing] = React.useState<User | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [toggling, setToggling] = React.useState<User | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  const users = React.useMemo(() => data ?? [], [data]);

  const filtered = React.useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();

    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (statusFilter === "active" && !user.isActive) return false;
      if (statusFilter === "inactive" && user.isActive) return false;
      if (
        needle &&
        !user.name.toLowerCase().includes(needle) &&
        !user.username.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [users, debouncedSearch, roleFilter, statusFilter]);

  const activeCount = users.filter((user) => user.isActive).length;
  const adminCount = users.filter((user) => user.role === "admin" && user.isActive).length;

  async function setActive(user: User, isActive: boolean) {
    try {
      await getRepositories().users.setActive(user.id, isActive);
      toast({
        title: isActive ? "Account reactivated" : "Account deactivated",
        description: `${user.name} can ${isActive ? "now" : "no longer"} sign in.`,
        variant: "success",
      });
      reload();
    } catch (cause) {
      toast({
        title: "Could not change the account",
        description: cause instanceof Error ? cause.message : "Please try again.",
        variant: "destructive",
      });
      throw cause;
    }
  }

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Account",
      sortable: true,
      sort: (user) => user.name,
      cell: (user) => (
        <button
          type="button"
          onClick={() => {
            setEditing(user);
            setFormOpen(true);
          }}
          className="flex items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Avatar className="size-9">
            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {user.name}
              {/* The parentheses and spacing matter: without them the marker is
                  announced as one word with the name. */}
              {user.id === currentUser?.id ? (
                <span className="ml-1.5 font-normal text-muted-foreground">(you)</span>
              ) : null}
            </span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {user.username}
            </span>
          </span>
        </button>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      sort: (user) => user.role,
      cell: (user) =>
        user.role === "admin" ? (
          <Badge>Admin</Badge>
        ) : (
          <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sort: (user) => (user.isActive ? "active" : "inactive"),
      cell: (user) =>
        user.isActive ? (
          <Badge variant="outline">Active</Badge>
        ) : (
          <Badge variant="destructive">Deactivated</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (user) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${user.name}`}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setEditing(user);
                setFormOpen(true);
              }}
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant={user.isActive ? "destructive" : "default"}
              disabled={!user.isActive && user.id === currentUser?.id}
              onSelect={() => setToggling(user)}
            >
              <Power className="size-4" aria-hidden />
              {user.isActive ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="User management"
        description={`${formatNumber(users.length)} accounts · ${formatNumber(activeCount)} active · ${formatNumber(adminCount)} admin${
          users.length - activeCount > 0 ? ` · ${users.length - activeCount} deactivated` : ""
        }`}
        actionLabel="New account"
        actionIcon={UserPlus}
        onAction={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or username"
        options={[]}
        active={null}
        onActiveChange={() => {}}
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="kasir">Cashiers</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Deactivated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(user) => user.id}
        isLoading={isLoading}
        emptyIcon={Users}
        emptyTitle="No accounts match"
        emptyDescription="Adjust the search or filters, or add a new account."
      />

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editing}
        onSaved={reload}
      />

      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(open) => {
          if (!open) setToggling(null);
        }}
        title={
          toggling?.isActive
            ? `Deactivate ${toggling?.name}?`
            : `Reactivate ${toggling?.name}?`
        }
        description={
          toggling?.isActive
            ? "They will be refused at the login screen. Orders they took stay exactly as they are."
            : "They will be able to sign in again with their existing password."
        }
        confirmLabel={toggling?.isActive ? "Deactivate" : "Reactivate"}
        destructive={toggling?.isActive ?? false}
        onConfirm={async () => {
          if (!toggling) return;
          await setActive(toggling, !toggling.isActive);
        }}
      />
    </div>
  );
}