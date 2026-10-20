"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Query parameters as state.
 *
 * The guideline this exists for: URL reflects state. Without it, reloading a
 * report loses the date range, the browser back button leaves a screen instead
 * of undoing a filter change, and a report cannot be linked to.
 *
 * Writes use `replace` rather than `push`, so changing a filter does not stack a
 * history entry per change. Callers whose text input should stay responsive
 * locally should write on a debounce — see the search field in ProductsScreen.
 */
export function useQueryState(): [
  Record<string, string>,
  (patch: Record<string, string | null | undefined>) => void,
] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = React.useMemo(() => {
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }, [params]);

  // `router.replace` re-renders with a fresh RSC payload even when the URL is
  // unchanged, which hands `useSearchParams()` a new object identity. Closing
  // over `params` directly would therefore give `setQuery` a new identity on
  // every navigation — and any `useEffect` that depends on `[setQuery]` and
  // calls it (the search-to-URL sync in POS and Transactions) would re-run
  // forever, firing an RSC fetch per iteration.
  //
  // Writes also need a base that survives two calls in the same tick: typing
  // a report's From then To date fires both before the first navigation lands,
  // so a base re-read from `useSearchParams()` (or from `window.location`,
  // which App Router does not update synchronously either) would build the
  // second write on the first's stale base and silently drop the first field.
  // A ref the callback updates itself — re-synced from `params` whenever an
  // external navigation does land — gives both properties: a stable callback
  // identity and a base that never loses an in-flight write.
  const searchRef = React.useRef(params.toString());
  React.useEffect(() => {
    searchRef.current = params.toString();
  }, [params]);

  const setQuery = React.useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchRef.current);

      for (const [key, value] of Object.entries(patch)) {
        // Empty values are dropped rather than written as `?q=`, so a clean
        // screen has a clean URL rather than a trail of blanks.
        if (value === null || value === undefined || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }

      const query = next.toString();
      const target = query ? `${pathname}?${query}` : pathname;

      // Advance the base before the guards so a second write in the same tick
      // merges onto this one, and so a no-op against a not-yet-updated
      // `window.location` still records what the URL is about to say.
      searchRef.current = query;

      // No-op guards: a replace with an unchanged URL still triggers a
      // navigation + RSC fetch, which is how the loop above sustains itself.
      const current =
        typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`;
      if (target === current) {
        return;
      }

      router.replace(target, { scroll: false });
    },
    [pathname, router],
  );

  return [state, setQuery];
}