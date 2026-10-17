import type { Role } from "@/types/auth";

/**
 * Demo accounts shown on the login screen as click-to-fill buttons.
 *
 * These mirror the mock store's seeded users. They exist because the app has no
 * server to register against yet; the login screen hides this block once real
 * authentication is wired up.
 */
export interface DemoCredential {
  role: Role;
  username: string;
  password: string;
  name: string;
}

export const DEMO_CREDENTIALS: readonly DemoCredential[] = [
  {
    role: "admin",
    username: "admin",
    password: "admin123",
    name: "Budi Santoso",
  },
  {
    role: "kasir",
    username: "kasir",
    password: "kasir123",
    name: "Siti Rahayu",
  },
];