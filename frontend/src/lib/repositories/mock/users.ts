"use client";

import { toPublicUser } from "@/lib/auth";
import { mutate, readDb } from "@/lib/repositories/mock/db";
import { clone, simulateLatency } from "@/lib/repositories/mock/helpers";
import type { UserRepository } from "@/lib/repositories/types";
import type { StoredUser } from "@/types/auth";

function findByUsername(db: { users: StoredUser[] }, username: string): StoredUser | undefined {
  const needle = username.trim().toLowerCase();
  return db.users.find((u) => u.username.toLowerCase() === needle);
}

export const userRepository: UserRepository = {
  async list() {
    await simulateLatency(180);
    return readDb().users.map(toPublicUser).sort((a, b) => a.name.localeCompare(b.name));
  },

  async create(input) {
    await simulateLatency();
    return mutate((db) => {
      if (findByUsername(db, input.username)) {
        throw new Error("That username is already taken.");
      }
      if (!input.password) throw new Error("A password is required.");

      const highest = db.users.reduce((max, user) => {
        const suffix = Number.parseInt(user.id.replace("u-", ""), 10);
        return Number.isNaN(suffix) ? max : Math.max(max, suffix);
      }, 0);

      const user: StoredUser = {
        id: `u-${highest + 1}`,
        name: input.name,
        username: input.username.trim(),
        password: input.password,
        role: input.role,
        isActive: input.isActive,
      };

      db.users.push(user);
      return toPublicUser(clone(user));
    });
  },

  async update(id, input) {
    await simulateLatency();
    return mutate((db) => {
      const user = db.users.find((u) => u.id === id);
      if (!user) throw new Error("User not found.");

      const clash = findByUsername(db, input.username);
      if (clash && clash.id !== id) throw new Error("That username is already taken.");

      user.name = input.name;
      user.username = input.username.trim();
      user.role = input.role;
      user.isActive = input.isActive;

      // A blank password on edit means "leave it as it is".
      if (input.password) user.password = input.password;

      return toPublicUser(clone(user));
    });
  },

  async setActive(id, isActive) {
    await simulateLatency(120);
    return mutate((db) => {
      const user = db.users.find((u) => u.id === id);
      if (!user) throw new Error("User not found.");
      if (!isActive) assertNotLastAdmin(db, id);

      user.isActive = isActive;
      return toPublicUser(clone(user));
    });
  },

  async resetMfa(id) {
    await simulateLatency(120);
    return mutate((db) => {
      const user = db.users.find((u) => u.id === id);
      if (!user) throw new Error("User not found.");
      user.mfaEnabled = false;
      return toPublicUser(clone(user));
    });
  },

  async authenticate(username, password, role) {
    await simulateLatency(600);

    const match = findByUsername(readDb(), username);
    if (!match || match.password !== password) {
      return { ok: false as const, reason: "invalid" as const };
    }
    if (!match.isActive) {
      return { ok: false as const, reason: "inactive" as const };
    }
    if (role !== undefined && match.role !== role) {
      return { ok: false as const, reason: "role-mismatch" as const };
    }

    return { ok: true as const, user: toPublicUser(match) };
  },

  async verifyMfa(_mfaToken: string, _code: string) {
    await simulateLatency(400);
    const user = readDb().users[0]!;
    return { ok: true as const, user: toPublicUser(user) };
  },

  async confirmMfaSetup(_setupToken: string, _code: string) {
    await simulateLatency(400);
    const user = readDb().users[0]!;
    return {
      ok: true as const,
      user: toPublicUser(user),
      backupCodes: ['123456-789abc', '987654-321cba'],
    };
  },

  async mfaStatus() {
    await simulateLatency(120);
    const user = readDb().users.find((u) => u.role === "admin") ?? readDb().users[0]!;
    return {
      mfaEnabled: Boolean(user.mfaEnabled),
      backupCodesRemaining: user.mfaEnabled ? 8 : 0,
    };
  },

  async regenerateBackupCodes(_currentPassword: string, _code: string) {
    await simulateLatency(400);
    // The mock has no real TOTP; any six-digit code is accepted so the UI
    // flow can be exercised without a server.
    return {
      ok: true as const,
      backupCodes: [
        "8f2a1c-9d44be",
        "70a3d1-c69e52",
        "2a77bf-10c039",
        "6d845e-18a2fb",
        "9b6403-ce70d5",
        "fa2911-b27e6c",
        "03ce9f-4a1d80",
        "c6e52b-8d47f1",
      ],
    };
  },
};

/**
 * Refuses to deactivate the last active admin.
 *
 * Without this the app can be left with no account that can reach user
 * management, and the only way back would be editing `localStorage` by hand.
 */
export function assertNotLastAdmin(
  db: { users: StoredUser[] },
  id: string,
): void {
  const target = db.users.find((u) => u.id === id);
  if (!target || target.role !== "admin") return;

  const otherActiveAdmins = db.users.filter(
    (u) => u.role === "admin" && u.isActive && u.id !== id,
  );
  if (otherActiveAdmins.length === 0) {
    throw new Error("This is the last active admin. Promote another account first.");
  }
}