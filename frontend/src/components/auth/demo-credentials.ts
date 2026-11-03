import type { Role } from "@/types/auth";

/**
 * Seeded accounts for the demo build.
 *
 * The seed script creates exactly these users (`backend/src/seed.ts`), and the
 * login screen offers them as click-to-fill buttons. They are intentionally
 * public in this demo; a real deployment must replace the seed accounts before
 * exposing the app.
 */
export const DEMO_CREDENTIALS: ReadonlyArray<{
  role: Role;
  username: string;
  password: string;
}> = [
  { role: "admin", username: "admin", password: "admin123" },
  { role: "kasir", username: "kasir", password: "kasir123" },
];
