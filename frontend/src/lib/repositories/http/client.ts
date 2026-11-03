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
 * When unset, calls go to this app's own origin (`/api`) and the Next.js
 * rewrite introduced in `next.config.ts` forwards them to `API_PROXY_TARGET`.
 * That is the portable default: the same build works on localhost, on a LAN
 * address, and on the deployed domain, because no machine-specific hostname is
 * baked into the bundle. Setting `NEXT_PUBLIC_API_URL` still points the browser
 * straight at an API on another origin.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim();

/**
 * `withCredentials` sends the session cookie.
 *
 * The session is an httpOnly cookie, not a bearer token, precisely so that no
 * interceptor has to attach a header to every call. This line is the counterpart
 * to that decision — without it the browser stores the cookie and then declines
 * to send it, and login appears to work until the first authenticated request
 * fails.
 *
 * The instance is created on first use, not at module load: this module is
 * imported by the auth store, which the layout pulls in, which every prerendered
 * page evaluates — so a missing env var used to abort the whole build instead
 * of only the request that needs it.
 */
let instance: AxiosInstance | null = null;

function createInstance(): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL ? `${BASE_URL.replace(/\/$/, "")}/api` : "/api",
    withCredentials: true,
    timeout: 20_000,
    headers: { "Content-Type": "application/json" },
  });
}

export const http: AxiosInstance = new Proxy({} as AxiosInstance, {
  get(_target, property) {
    instance ??= createInstance();

    const value = instance[property as keyof AxiosInstance];

    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(instance)
      : value;
  },
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
 * Broadcasts "the session is gone" once, so every listener reacts to one event
 * instead of each screen inventing its own.
 *
 * A registry rather than a direct store import: the auth store imports this
 * module transitively, so reaching back would close a require cycle.
 */
type UnauthenticatedHandler = () => void;

const unauthenticatedHandlers = new Set<UnauthenticatedHandler>();

export function onUnauthenticated(handler: UnauthenticatedHandler): () => void {
  unauthenticatedHandlers.add(handler);
  return () => unauthenticatedHandlers.delete(handler);
}

function notifyUnauthenticated(): void {
  for (const handler of unauthenticatedHandlers) handler();
}

/**
 * Requests whose 401s are expected answers, not "you have been signed out".
 *
 * A wrong password on the login screen is a 401 the user caused on purpose, and
 * the logout 401 means "there was no session to end" — neither should clear the
 * session state or bounce anyone anywhere.
 */
const AUTH_EXEMPT: readonly string[] = ["/auth/login", "/auth/logout"];

function failedUrl(error: unknown): string | undefined {
  if (axios.isAxiosError(error)) {
    return (error as AxiosError).config?.url;
  }
  return undefined;
}

/**
 * Normalises anything thrown by axios into an `ApiError`.
 *
 * A network failure or a 5xx from the Next.js rewrite has no envelope at all,
 * and would otherwise surface as "Request failed with status code 502" — which
 * tells a cashier nothing about whether to retry.
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

    // The API always writes an `error`/`message` envelope, so a 5xx without a
    // message did not come from the API. It is the rewrite reporting that the
    // API process is down — the same failure, just one hop away, and the user
    // needs the same advice: check the connection and try again.
    if (axiosError.response.status >= 500) {
      return new ApiError(
        axiosError.response.status,
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

export interface RequestOptions {
  /**
   * A 401 here is an expected answer, not proof that the current session is
   * gone. Hydration uses this: its request was sent before the user signed in,
   * so a late 401 must not erase the session that just replaced it.
   */
  suppressUnauthenticated?: boolean;
}

/**
 * Runs a request and re-throws anything as an `ApiError`.
 *
 * Every repository method goes through here, so a caller only ever has to handle
 * one error type.
 */
export async function request<T>(
  run: () => Promise<{ data: T }>,
  options: RequestOptions = {},
): Promise<T> {
  try {
    const response = await run();
    return response.data;
  } catch (error) {
    const apiError = toApiError(error);

    // One 401 outside the expected login/logout answers means the cookie died
    // mid-session. Everyone subscribed clears their copy at once, and the
    // layout's own guard — seeing no user — does the actual navigation.
    const url = failedUrl(error);
    if (
      apiError.status === 401 &&
      !options.suppressUnauthenticated &&
      !AUTH_EXEMPT.some((exempt) => url?.startsWith(exempt))
    ) {
      notifyUnauthenticated();
    }

    throw apiError;
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