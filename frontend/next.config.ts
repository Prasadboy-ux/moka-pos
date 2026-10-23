import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  /**
   * Production on Vercel: the browser calls `/api/*` on this app's own origin
   * and the request is forwarded to the API project. Same-origin is what lets
   * the session cookie's `SameSite=Lax` survive — the two `*.vercel.app`
   * hosts are different sites (vercel.app is on the Public Suffix List), so a
   * direct cross-host call would silently drop the cookie.
   *
   * Local dev sets no API_PROXY_TARGET: `NEXT_PUBLIC_API_URL` points straight
   * at http://localhost:3001, which is same-*site* with :3000 already, so no
   * proxy is needed and this returns no rewrites.
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