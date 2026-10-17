export type Role = "kasir" | "admin";

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
}

export interface Session {
  user: User;
  startedAt: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  kasir: "Cashier",
  admin: "Admin",
};

/** Where each role lands right after a successful sign-in. */
export const ROLE_HOME: Record<Role, string> = {
  kasir: "/dashboard/pos",
  admin: "/dashboard",
};