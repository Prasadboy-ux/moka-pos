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

  async authenticate(username, password) {
    await simulateLatency(600);

    const match = findByUsername(readDb(), username);
    if (!match || match.password !== password) {
      return { ok: false as const, reason: "invalid" as const };
    }
    if (!match.isActive) {
      return { ok: false as const, reason: "inactive" as const };
    }

    return { ok: true as const, user: toPublicUser(match) };
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