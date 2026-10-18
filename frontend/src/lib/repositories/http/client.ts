import axios, { AxiosError, type AxiosInstance } from "axios";

/**
 * The HTTP implementation of the repository seam.
 *
 * Screens call `getRepositories()` and never import anything from here, so this
 * folder is the only place that knows the API exists. Swapping the mock for the
 * real service was meant to be a change to one file — `../index.ts` — and this
 * is what that file now points at.
 */

/**
 * Base URL, resolved once at module load.
 *
 * A missing value fails loudly rather than defaulting to localhost, so a
 * misconfigured build cannot quietly talk to a developer's machine.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!BASE_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not set. Copy .env.local.example to .env.local and point it at the API.",
  );
}

/**
 * `withCredentials` sends the session cookie.
 *
 * The session is an httpOnly cookie, not a bearer token, precisely so that no
 * interceptor has to attach a header to every call. This line is the counterpart
 * to that decision — without it the browser stores the cookie and then declines
 * to send it, and login appears to work until the first authenticated request
 * fails.
 */
export const http: AxiosInstance = axios.create({
  baseURL: `${BASE_URL.replace(/\/$/, "")}/api`,
  withCredentials: true,
  timeout: 20_000,
  headers: { "Content-Type": "application/json" },
});

/**
 * The server's error envelope, surfaced as a real Error.
 *
 * `message` is used verbatim because the server writes it as a sentence meant for
 * the user — "Only 5000 gram on hand", not "Validation failed". Screens already
 * show `error.message` (`useAsync`, `CheckoutDialog`, `StockAdjustDialog`), so
 * anything else would need each screen rewritten.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly reason?: string;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    reason?: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.reason = reason;
    this.fields = fields;
  }

  /** True for the failures that mean "sign in again", not "you did something wrong". */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

/**
 * Normalises anything thrown by axios into an `ApiError`.
 *
 * A network failure or a 502 from a proxy has no envelope at all, and would
 * otherwise surface as "Request failed with status code 502" — which tells a
 * cashier nothing about whether to retry.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      error?: string;
      message?: string;
      reason?: string;
      fields?: Record<string, string>;
    }>;

    const body = axiosError.response?.data;

    if (body?.message) {
      return new ApiError(
        axiosError.response!.status,
        body.error ?? "unknown",
        body.message,
        body.reason,
        body.fields,
      );
    }

    if (!axiosError.response) {
      return new ApiError(
        0,
        "network",
        "Cannot reach the server. Check the connection and try again.",
      );
    }

    return new ApiError(
      axiosError.response.status,
      "unknown",
      "Something went wrong. Please try again.",
    );
  }

  return new ApiError(0, "unknown", "Something went wrong. Please try again.");
}

/**
 * Runs a request and re-throws anything as an `ApiError`.
 *
 * Every repository method goes through here, so a caller only ever has to handle
 * one error type.
 */
export async function request<T>(
  run: () => Promise<{ data: T }>,
): Promise<T> {
  try {
    const response = await run();
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Drops undefined and empty values so query strings stay readable. */
export function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}