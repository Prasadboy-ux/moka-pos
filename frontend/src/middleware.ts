import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-side gate for the dashboard.
 *
 * Only presence of the session cookie is checked — verifying a signed JWT needs
 * the API's secret, and shipping that into the frontend runtime to let this
 * file do more would be the wrong trade. The real enforcement is unchanged:
 * every API call is authenticated against the database, and the dashboard
 * layout still gates rendering on the hydrate probe. This middleware adds one
 * thing client code cannot do: a server-side redirect *before* any dashboard
 * code is downloaded at all.
 *
 * `/login` is deliberately *not* redirected back when the cookie is present.
 * The login screen already skips itself client-side for a live session, and a
 * redirect here would loop against a stale cookie the API no longer accepts —
 * the middleware cannot verify the signature, so it must not make a hard
 * judgement about whether the cookie still means anything.
 */

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/dashboard") && !req.cookies.get("moka_session")) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
