export type Role = "kasir" | "admin";

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
}

/**
 * A user as the data layer stores them, with the credential still attached.
 *
 * Nothing outside the auth repository should ever hold one: `authenticate` and
 * `toPublicUser` are the only boundary between the two shapes, which keeps a
 * password from leaking into a component or a persisted session.
 */
export interface StoredUser extends User {
  password: string;
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

/** Why a sign-in was refused, so the form can say something specific. */
export type LoginFailureReason = "invalid" | "inactive" | "role-mismatch";

export const LOGIN_ERROR_MESSAGE: Record<LoginFailureReason, string> = {
  invalid: "Incorrect username or password.",
  "role-mismatch": "This account is not registered for the selected role.",
  inactive: "This account has been deactivated. Contact an administrator.",
};