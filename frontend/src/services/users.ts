import type { Role, User } from "@/types/auth";

/**
 * Mock adapter for the users resource.
 *
 * The frontend talks to this module, never to the network directly. When the
 * Express API is ready, only this file changes: swap the bodies below for
 * axios calls and every screen keeps working untouched.
 */

interface StoredUser extends User {
  password: string;
}

const MOCK_USERS: StoredUser[] = [
  {
    id: "u-1",
    name: "Budi Santoso",
    username: "admin",
    password: "admin123",
    role: "admin",
    isActive: true,
  },
  {
    id: "u-2",
    name: "Siti Rahayu",
    username: "kasir",
    password: "kasir123",
    role: "kasir",
    isActive: true,
  },
  {
    id: "u-3",
    name: "Andi Wijaya",
    username: "kasir2",
    password: "kasir123",
    role: "kasir",
    isActive: false,
  },
];

export const DEMO_CREDENTIALS: ReadonlyArray<{
  role: Role;
  username: string;
  password: string;
  name: string;
}> = [
  { role: "admin", username: "admin", password: "admin123", name: "Budi Santoso" },
  { role: "kasir", username: "kasir", password: "kasir123", name: "Siti Rahayu" },
];

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" | "role-mismatch" | "inactive" };

export const LOGIN_ERROR_MESSAGE: Record<
  Extract<LoginResult, { ok: false }>["reason"],
  string
> = {
  invalid: "Incorrect username or password.",
  "role-mismatch": "This account is not registered for the selected role.",
  inactive: "This account has been deactivated. Contact an administrator.",
};

function stripPassword({ password: _password, ...user }: StoredUser): User {
  return user;
}

function simulateLatency(ms = 600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function login(
  username: string,
  password: string,
  role: Role,
): Promise<LoginResult> {
  await simulateLatency();

  const match = MOCK_USERS.find((u) => u.username === username.trim().toLowerCase());

  if (!match || match.password !== password) {
    return { ok: false, reason: "invalid" };
  }

  if (!match.isActive) {
    return { ok: false, reason: "inactive" };
  }

  if (match.role !== role) {
    return { ok: false, reason: "role-mismatch" };
  }

  return { ok: true, user: stripPassword(match) };
}

export async function listUsers(): Promise<User[]> {
  await simulateLatency(200);
  return MOCK_USERS.map(stripPassword);
}