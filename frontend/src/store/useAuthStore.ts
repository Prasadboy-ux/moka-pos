"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Session, User } from "@/types/auth";

interface AuthState {
  /**
   * False until the persisted session has been read from storage.
   *
   * Guards must wait for this. On a hard page load the store starts empty, so a
   * guard that reads `session` immediately would treat a signed-in user as
   * signed out and bounce them to the login screen mid-load.
   */
  hydrated: boolean;
  markHydrated: () => void;
  session: Session | null;
  setSession: (user: User) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      hydrated: false,
      markHydrated: () => set({ hydrated: true }),
      session: null,
      setSession: (user) =>
        set({ session: { user, startedAt: new Date().toISOString() } }),
      clearSession: () => set({ session: null }),
    }),
    {
      name: "moka-pos.auth",
      storage: createJSONStorage(() => localStorage),
      /**
       * Rehydration is deferred to an effect rather than running during store
       * creation. That keeps the server-rendered markup and the first client
       * render identical, which avoids a hydration mismatch.
       */
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

/**
 * Triggers rehydration once per document and reports when it is safe to make
 * an auth decision. Call this in any component that gates on the session.
 */
export function useAuthHydrated(): boolean {
  const hydrated = useAuthStore((state) => state.hydrated);

  useEffect(() => {
    if (!useAuthStore.persist.hasHydrated()) {
      void useAuthStore.persist.rehydrate();
    }
  }, []);

  return hydrated;
}