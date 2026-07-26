import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight UX guard: bounces unauthenticated navigation to /login. It checks
 * for the cookie's presence only, not its signature — the real security
 * boundary is `requireAuth()` inside every server action and route handler.
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/media",
  "/api/worker/callback",
  // The export surface is hit by headless Chromium, which carries no session;
  // it authorises itself with an HMAC token instead (see lib/render.ts).
  "/render",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (!request.cookies.has("rs_studio_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
