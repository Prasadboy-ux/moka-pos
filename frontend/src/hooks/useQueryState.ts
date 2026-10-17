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

  const setQuery = React.useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(params.toString());

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
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return [state, setQuery];
}