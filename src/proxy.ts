import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED_PREFIXES, SESSION_COOKIE_NAME } from "@/lib/config";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Per-request CSP with a nonce. Next.js reads the nonce from the request's CSP
 * header and stamps it on its own inline/bootstrap scripts; `strict-dynamic`
 * lets those scripts load their chunks. Every page here is dynamic, so a
 * per-request nonce costs nothing in caching.
 *
 * style-src keeps 'unsafe-inline' (React style props / UI libraries emit inline
 * styles); script injection is the dangerous half and stays nonce-locked.
 * Hosts below are the ones Phases 3-5 need (Storage images/uploads, client auth).
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      "https://firebasestorage.googleapis.com",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      isDev ? "ws: http://127.0.0.1:*" : "",
    ].filter(Boolean).join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Optimistic gate: bounces cookie-less visitors to /login before any page code
 * runs. It does NOT verify the cookie and is NOT the security boundary — every
 * layout, server action and route handler re-verifies the session itself.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protectedPath = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (protectedPath && !req.cookies.get(SESSION_COOKIE_NAME)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const headers = new Headers(req.headers);
  headers.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
