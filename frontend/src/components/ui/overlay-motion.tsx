"use client";

import * as React from "react";

/**
 * Shared internals for primitives whose open/close is owned by Motion instead
 * of Radix's CSS-presence timing (dialog, alert dialog, dropdown, select).
 *
 * The trade that makes Motion exits possible: Radix normally unmounts its
 * portal the instant `open` flips false, so an exit animation never survives
 * unless the primitive keeps a copy of `open` in React state, renders the
 * portal with `forceMount`, and lets `AnimatePresence` decide when the tree
 * really disappears. `useControlledOpen` + `createOverlayOpenContext` exist so
 * every primitive wires that up the same way instead of four private copies.
 */

/** Context carrying the live `open` flag from a primitive root to its content. */
export interface OverlayOpenContextValue {
  open: boolean;
}

/**
 * Controlled or uncontrolled, the primitive needs one boolean to hand to
 * `AnimatePresence`. Mirrors Radix: the `open` prop wins when provided, state
 * carries the uncontrolled case, and `onOpenChange` is always relayed through.
 */
export function useControlledOpen(
  openProp?: boolean,
  onOpenChangeProp?: (open: boolean) => void,
): [boolean, (open: boolean) => void] {
  const [fallback, setFallback] = React.useState(openProp ?? false);

  const open = openProp ?? fallback;

  const setOpen = React.useCallback(
    (next: boolean) => {
      onOpenChangeProp?.(next);
      if (openProp === undefined) setFallback(next);
    },
    [onOpenChangeProp, openProp],
  );

  return [open, setOpen];
}

/** Per-primitive context + hook so `…Content` can read the live open flag. */
export function createOverlayOpenContext() {
  const Context = React.createContext<OverlayOpenContextValue | null>(null);

  function useOverlayOpen(): boolean {
    const value = React.useContext(Context);
    if (value === null) {
      throw new Error(
        "Overlay content must be used within its matching overlay root",
      );
    }
    return value.open;
  }

  return { Context, useOverlayOpen };
}
