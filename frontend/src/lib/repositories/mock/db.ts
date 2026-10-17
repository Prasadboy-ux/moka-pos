"use client";

import type { Database } from "@/lib/repositories/types";
import { buildSeed, DB_VERSION } from "@/lib/repositories/mock/seed";

/**
 * The mock persistence layer: one JSON document in `localStorage`.
 *
 * Screens never import this. They call repositories, which call `readDb` and
 * `mutate` here, so swapping in HTTP later replaces this file and nothing else.
 */

const DB_KEY = "moka-pos.db";

/**
 * Holds the document for the lifetime of the tab so two repositories called in
 * the same effect cannot read different snapshots.
 */
let cache: Database | null = null;

function canPersist(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function load(): Database {
  if (canPersist()) {
    try {
      const raw = window.localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Database;
        /**
         * A version mismatch means the seed shape changed. Reseeding beats
         * shipping a migration for data that only ever existed in a browser
         * during development.
         */
        if (parsed.version === DB_VERSION) {
          return { ...parsed, counters: { ...parsed.counters } };
        }
      }
    } catch {
      // Corrupt or unreadable: fall through to a fresh seed.
    }
  }

  return buildSeed();
}

/** Current document. Read-only by convention; go through `mutate` to write. */
export function readDb(): Database {
  cache ??= load();
  return cache;
}

function persist(db: Database): void {
  cache = db;
  if (!canPersist()) return;

  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Private browsing or a full quota. The in-memory copy still works for this
    // session, which is enough to keep the screen usable.
  }
}

/**
 * Read-modify-write. Every mutation goes through here so persistence can never
 * be skipped by accident.
 *
 * Atomic: the callback either succeeds and the document is written, or it
 * throws and the pre-call snapshot is restored. That matters because a single
 * write spans several records — recording a sale also moves stock — and a
 * half-applied write would leave the ledger disagreeing with the levels.
 */
export function mutate<T>(fn: (db: Database) => T): T {
  const db = readDb();
  const snapshot = structuredClone(db);

  let result: T;
  try {
    result = fn(db);
  } catch (error) {
    persist(structuredClone(snapshot));
    throw error;
  }

  persist(db);
  return result;
}

/** Throws away the cached document and reseeds. Exposed for demo resets. */
export function resetDb(): void {
  persist(buildSeed());
}

/** Next id for a collection, prefixed so ids stay readable in the ledger. */
export function nextId(prefix: string, existing: ReadonlyArray<{ id: string }>): string {
  const highest = existing.reduce((max, record) => {
    const suffix = Number.parseInt(record.id.replace(`${prefix}-`, ""), 10);
    return Number.isNaN(suffix) ? max : Math.max(max, suffix);
  }, 0);

  return `${prefix}-${highest + 1}`;
}