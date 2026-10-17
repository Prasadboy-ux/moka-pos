"use client";

import { useEffect, useState } from "react";

/**
 * Trails a fast-changing value behind a delay.
 *
 * Search boxes run their filter straight off this rather than off the keystroke:
 * filtering a few hundred rows is cheap, but re-running a request or re-sorting a
 * table on every character is what makes a filter feel laggy.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}