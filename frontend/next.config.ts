import path from "node:path";
import type { NextConfig } from "next";

/**
 * Baseline response headers. The API runs helmet, but these pages are served by
 * Next, so without this the HTML shell had no framing or sniffing policy.
 *
 * HSTS is added only for a production build: sending it from local HTTP would
 * pin a developer's browser to a scheme the dev server does not serve.
 */
const isDev = process.env.NODE_ENV === "development";

/**
 * `API_PROXY_TARGET` is the backend origin. It is accepted with or without a
 * trailing `/api`, because both are natural ways to write it down:
 *
 *   https://api.example.com        -> https://api.example.com/api/:path*
 *   https://api.example.com/api    -> https://api.example.com/api/:path*
 *
 * Stripping the suffix here keeps a literal `.../api` value from becoming
 * `/api/api/...`, which the backend answers with a 404.
 */
const proxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "");
const apiOrigin = proxyTarget?.replace(/\/api$/, "");

/**
 * Scripts and styles need `'unsafe-inline'` because Next inlines its hydration
 * bootstrap and the app is statically rendered — a nonce would force every page
 * dynamic. The directives that matter for this app still hold: no third-party
 * script/style/frame origins, no plugins, no base-tag rewrite, and forms only
 * post to this origin. `wa.me` is a link target, not a fetched resource.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  experimental: {
    turbopackPluginRuntimeStrategy: 'forceWorkerThreads',
  },
  /**
   * The repository root also has a package.json (the local tooling for the
   * motion skill), so Next otherwise infers the wrong workspace root and warns
   * about two lockfiles. Point Turbopack at this app explicitly.
   */
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  /**
   * The browser calls `/api/*` on this app's own origin and the request is
   * forwarded to `API_PROXY_TARGET`. Same-origin is what lets the session
   * cookie's `SameSite=Lax` survive: two `*.vercel.app` hosts are different
   * sites (vercel.app is on the Public Suffix List), so a direct cross-host
   * call would silently drop the cookie.
   *
   * This is used in local development and in production. It also means the
   * same build works when the app is opened from another device on the LAN:
   * the browser only ever talks to the host it loaded the page from, never to
   * a `localhost` URL baked into the bundle at build time.
   */
  async rewrites() {
    if (!apiOrigin) return [];

    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
