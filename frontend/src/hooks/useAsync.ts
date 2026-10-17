"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  /** Re-runs the loader. Useful after a write that changes what a list shows. */
  reload: () => void;
}

interface Settled<T> {
  data: T | null;
  error: string | null;
}

/**
 * The one data-loading hook in the app.
 *
 * It exists because the hand-rolled `useState` + `useEffect` + `cancelled` flag
 * was copied across screens, and every copy was a chance to forget the flag and
 * set state after unmount. Here the cancellation, the error capture, and the
 * stale-response guard are the hook's problem instead of the caller's.
 *
 * `deps` behaves like a `useEffect` dependency list: change one and the loader
 * runs again. `reload` covers the case where the inputs did not change but the
 * data behind them did, after a write.
 *
 * State is only ever set from inside the promise callbacks. That is deliberate:
 * setting a loading flag synchronously in the effect body triggers an extra
 * render pass on every run, and the rule React's compiler enforces here is
 * right that it is usually a sign the loading flag was standing in for
 * something better derived. What this hook derives instead is `isLoading` — the
 * screen is loading only until the first result has arrived — and a reload
 * deliberately keeps showing the previous data instead of flashing a spinner.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList = [],
): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T>>({
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  // Reading the loader through a ref keeps it out of the dependency list, so
  // callers can pass an inline closure without retriggering on every render.
  const loaderRef = useRef(loader);

  /**
   * Effects run in declaration order, so this must stay above the fetch effect
   * below: the fetch then always sees the current closure, even when a rerender
   * happens before it. Assigning during render instead is what the compiler
   * rule rejects.
   */
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let cancelled = false;

    loaderRef.current().then(
      (data) => {
        if (cancelled) return;
        setSettled({ data, error: null });
      },
      (cause: unknown) => {
        if (cancelled) return;
        setSettled((previous) => ({
          // Keep whatever loaded before: a failed refresh should not blank a
          // screen that was showing good data a moment ago.
          data: previous.data,
          error:
            cause instanceof Error
              ? cause.message
              : "Something went wrong while loading.",
        }));
      },
    );

    return () => {
      // A late response from a superseded run must not overwrite fresher data.
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data: settled.data,
    error: settled.error,
    isLoading: settled.data === null && settled.error === null,
    reload,
  };
}