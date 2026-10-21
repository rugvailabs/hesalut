/**
 * Route protection for /dashboard/*, /admin/* and booking.
 *
 * Browsing is public: the home page, search, results, business profiles and
 * city/category pages need no account. Sign-in is asked for only where it is
 * needed - booking (/business/{slug}/book) here, and on the listing page the
 * phone number and the enquiry form, which the API withholds and the page
 * swaps for a sign-in link. A signed-out visitor is sent to /login with the
 * page they asked for in `next`, so they land back on it after signing in.
 *
 * This is a cheap first gate, NOT the security boundary. It checks that a
 * well-formed, unexpired JWT cookie exists and - for /admin - that the cached
 * role says admin. It cannot verify the signature: the signing secret lives on
 * the backend and never reaches this app. Every protected page still calls
 * requireUser()/requireAdmin(), which ask FastAPI who the caller really is.
 *
 * Both failure cases redirect to /login, per the brief.
 */

import { NextRequest, NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE, ROLE_COOKIE } from "@/lib/cookies";
import { isTokenExpired } from "@/lib/jwt";
import { safeNext } from "@/lib/safe-next";

/** Prefixes that require a signed-in user. */
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

/** Booking a listing: /business/{slug}/book. Any signed-in user. */
const BOOKING_PAGE = /^\/business\/[^/]+\/book\/?$/;

/** Prefixes that additionally require is_admin. */
const ADMIN_PREFIXES = ["/admin"];

/**
 * Prefixes that require a business-owner (or admin) account.
 *
 * Before this existed /dashboard was gated on authentication alone, so any
 * signed-in customer could open the owner console.
 */
const OWNER_PREFIXES = ["/dashboard"];

const OWNER_ROLES = new Set(["business_owner", "admin"]);

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Send the visitor to /login, remembering where they were headed. */
function redirectToLogin(
  req: NextRequest,
  target: string,
  clearCookies: boolean,
  forbidden = false,
): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  // `target` is the path plus query string (/explore/results?q=plumber), so the
  // search survives the round trip. The query string is encoded into one
  // `next` value; /login re-checks it with safeNext before using it.
  // `forbidden` marks "signed in, but not allowed". /login must not honour
  // `next` in that case or the two routes bounce off each other forever.
  const next = safeNext(target);
  url.search =
    (next ? `?next=${encodeURIComponent(next)}` : "?") +
    (forbidden ? `${next ? "&" : ""}forbidden=1` : "");

  const res = NextResponse.redirect(url);
  if (clearCookies) {
    // A stale token would otherwise bounce them again on the next click.
    res.cookies.delete(ACCESS_TOKEN_COOKIE);
    res.cookies.delete(ROLE_COOKIE);
  }
  return res;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const target = pathname + search;

  const isBooking = BOOKING_PAGE.test(pathname);

  if (!matches(pathname, PROTECTED_PREFIXES) && !isBooking) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  // Signed out, or the token has lapsed.
  if (!token || isTokenExpired(token)) {
    return redirectToLogin(req, target, Boolean(token));
  }

  // Booking only needs a signed-in user, whatever the role.
  if (isBooking) return NextResponse.next();

  const role = req.cookies.get(ROLE_COOKIE)?.value ?? "";

  // Signed in but not an admin.
  if (matches(pathname, ADMIN_PREFIXES) && role !== "admin") {
    return redirectToLogin(req, target, false, true);
  }

  // Signed in but not a business owner.
  if (matches(pathname, OWNER_PREFIXES) && !OWNER_ROLES.has(role)) {
    return redirectToLogin(req, target, false, true);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/business/:slug/book",
  ],
};
