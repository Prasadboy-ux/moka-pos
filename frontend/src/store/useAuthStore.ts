"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { ApiError, onUnauthenticated } from "@/lib/repositories/http/client";
import { sessionRepository } from "@/lib/repositories/http/commerce";
import type { Session, User } from "@/types/auth";
import { useCartStore } from "./useCartStore";

interface AuthState {
  /**
   * False until the server has been asked whether there is a session.
   *
   * Guards must wait for this. On a hard page load the store starts empty, so a
   * guard that read `session` immediately would treat a signed-in user as signed
   * out and bounce them to the login screen mid-load.
   *
   * Previously this meant "the persisted session had been read out of
   * localStorage". It now means "GET /api/auth/me has come back", which is the
   * same wait for a different reason: the session is a cookie, and the cookie is
   * httpOnly, so nothing in the browser can read it without asking.
   */
  hydrated: boolean;
  markHydrated: () => void;
  session: Session | null;
  setSession: (user: User) => void;
  clearSession: () => void;
}

/**
 * No persistence middleware.
 *
 * The session used to be mirrored into `localStorage` under `moka-pos.auth`,
 * which meant two sources of truth: a browser could look signed in while the
 * cookie it actually authenticates with had long expired, and every request then
 * failed. The cookie is now the only session, so there is nothing to persist.
 */
/**
 * One listener for the whole app: when any API call comes back 401, the session
 * is gone and every store consumer must agree. Clearing the local copy is all
 * that is needed — the dashboard layout's guard already navigates a cleared
 * session to the login screen, so no redirect is duplicated here.
 *
 * `clearSession` is *not* this: it also calls the server, and the server has
 * just answered, so there is no session left to end.
 */
onUnauthenticated(() => {
  useAuthStore.setState({ session: null });
});

export const useAuthStore = create<AuthState>()((set) => ({
  hydrated: false,
  markHydrated: () => set({ hydrated: true }),
  session: null,
  setSession: (user) =>
    set({ session: { user, startedAt: new Date().toISOString() } }),

  /**
   * Clears the server session too, not just the local copy.
   *
   * Forgetting the user locally while the cookie stayed valid would leave a
   * signed-in session the app no longer knows about. The request result is
   * ignored: the local state is cleared either way, because a failed logout
   * call should not strand someone on a screen they asked to leave.
   */
  clearSession: () => {
    void sessionRepository.logout().catch(() => undefined);
    // The cart survives a refresh, but not a sign-out: the next person at the
    // till must not inherit someone else's half-finished order.
    useCartStore.getState().clear();
    set({ session: null });
  },
}));

/**
 * Asks the server who we are, once per document, and reports when it is safe to
 * make an auth decision. Call this in any component that gates on the session.
 */
export function useAuthHydrated(): boolean {
  const hydrated = useAuthStore((state) => state.hydrated);

  useEffect(() => {
    // Two components can mount on the same render; only the first should ask.
    if (useAuthStore.getState().hydrated) return;

    let cancelled = false;

    void (async () => {
      try {
        const { user } = await sessionRepository.me();
        if (!cancelled) useAuthStore.getState().setSession(user);
      } catch (error) {
        // A 401 is the ordinary answer for a browser with no session cookie, and
        // is not worth logging. Anything else is a real problem worth seeing.
        if (!(error instanceof ApiError && error.status === 401)) {
          console.warn("[auth] could not read the session", error);
        }
      } finally {
        if (!cancelled) useAuthStore.getState().markHydrated();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return hydrated;
}