"use client";

import type { StoredUser, User } from "@/types/auth";

/**
 * The only place a password crosses from a stored record into app code.
 *
 * Screens and stores receive `User`, which has no credential field at all, so
 * there is no path for one to reach a component tree or `localStorage`.
 */
export function toPublicUser({ password: _password, ...user }: StoredUser): User {
  return user;
}