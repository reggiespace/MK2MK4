import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Lightweight UX guard. The real security boundary is `requireOperator()` on
// every server-side data access; this just bounces unauthenticated navigation
// to /login. Validates cookie presence only (not signature).
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/media", "/api/worker/callback"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = request.cookies.has("giq_session");
  if (!hasSession) {
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
