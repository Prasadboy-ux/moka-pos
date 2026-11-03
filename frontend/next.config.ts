import path from "node:path";
import type { NextConfig } from "next";

/**
 * Baseline response headers. The API runs helmet, but these pages are served by
 * Next, so without this the HTML shell had no framing or sniffing policy.
 *
 * HSTS is added only for a production build: sending it from local HTTP would
 * pin a developer's browser to a scheme the dev server does not serve.
 */
const securityHeaders = [
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
    const target = process.env.API_PROXY_TARGET?.replace(/\/$/, "");

    if (!target) return [];

    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
