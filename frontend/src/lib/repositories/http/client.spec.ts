import { describe, expect, it, vi } from "vitest";

import { onUnauthenticated, request } from "./client";

function unauthorized(url: string): Error {
  const error = new Error("Session expired.");
  Object.assign(error, {
    isAxiosError: true,
    config: { url },
    response: {
      status: 401,
      data: { error: "unauthenticated", message: "Session expired." },
    },
  });
  return error;
}

describe("request 401 handling", () => {
  it("notifies listeners for an ordinary 401", async () => {
    const handler = vi.fn();
    const stop = onUnauthenticated(handler);

    try {
      await expect(
        request(() => Promise.reject(unauthorized("/orders"))),
      ).rejects.toMatchObject({ status: 401 });
      expect(handler).toHaveBeenCalledOnce();
    } finally {
      stop();
    }
  });

  it("does not notify when the caller owns the 401", async () => {
    const handler = vi.fn();
    const stop = onUnauthenticated(handler);

    try {
      await expect(
        request(() => Promise.reject(unauthorized("/auth/me")), {
          suppressUnauthenticated: true,
        }),
      ).rejects.toMatchObject({ status: 401 });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it("keeps login refusals out of the session-expiry path", async () => {
    const handler = vi.fn();
    const stop = onUnauthenticated(handler);

    try {
      await expect(
        request(() => Promise.reject(unauthorized("/auth/login"))),
      ).rejects.toMatchObject({ status: 401 });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
