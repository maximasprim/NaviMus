import { NextResponse, type NextRequest } from "next/server";
import { SESSION_HINT_COOKIE } from "./lib/session-core";
import { safeNextPath } from "./lib/auth-redirect";

/**
 * Keeps signed-out visitors on the login page: they are redirected there BEFORE any page (or its menus)
 * is rendered. The cookie checked is a non-secret "signed in" hint (see lib/session-core.ts); the real
 * credentials are httpOnly cookies that only the API validates. A stale hint is harmless: the first
 * API call returns 401, the hint is cleared and the browser is sent back to /login?expired=1.
 */
const PUBLIC_PATHS = ["/login"];

const isPublic = (pathname: string) => PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function middleware(req: NextRequest) {
  const { pathname, search, searchParams } = req.nextUrl;
  const signedIn = req.cookies.get(SESSION_HINT_COOKIE)?.value === "1";

  if (!signedIn && !isPublic(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = `${pathname}${search}`;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // Already signed in: no reason to show the login form - unless the session was just reported expired,
  // which must be allowed to render (it also guarantees this can never become a redirect loop).
  if (signedIn && pathname === "/login" && !searchParams.has("expired")) {
    return NextResponse.redirect(new URL(safeNextPath(searchParams.get("next")), req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except the API proxy, Next's own assets, and files with an extension (images, fonts, ...).
  matcher: ["/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
