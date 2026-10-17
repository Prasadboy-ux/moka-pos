/**
 * Small shared helpers for the mock repositories.
 *
 * The latency keeps loading states honest while the data is local: without it a
 * spinner appears and vanishes in the same frame, which hides real bugs like
 * missing `await`s and makes the screens harder to trust while developing.
 */
export function simulateLatency(ms = 180): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deep enough for the flat records in the store. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Collapses a slug from user input into an id fragment.
 * "Non Coffee" -> "non-coffee", used for new category and product ids.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Makes an id unique by appending -2, -3, ... when the base is taken. */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}