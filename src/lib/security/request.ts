import { AuthError } from "@/lib/auth/errors";

/**
 * CSRF defence for cookie-authenticated, state-changing route handlers.
 *
 * App Hosting forwards only the `__session` cookie to the backend, so a
 * double-submit-cookie token is not an option. Instead we layer:
 *  1. Fetch-metadata: browsers send `Sec-Fetch-Site`; anything other than
 *     same-origin is refused.
 *  2. `Origin` must equal the request's own origin (covers older browsers).
 *  3. A custom header + JSON content type, which a cross-site form or simple
 *     request cannot send without a CORS preflight (which we never grant).
 * Next.js server actions carry their own built-in Origin check.
 */
export function assertSameOrigin(req: Request, opts: { multipart?: boolean } = {}): void {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw new AuthError("csrf");

  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AuthError("csrf");
    }
    if (!host || originHost !== host) throw new AuthError("csrf");
  } else if (!site) {
    // Neither header: not a browser fetch from our pages.
    throw new AuthError("csrf");
  }

  if (req.headers.get("x-requested-with") !== "fetch") throw new AuthError("csrf");
  // multipart/form-data is a CORS-safelisted type, but the required custom header above still forces a preflight.
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!(ct.startsWith("application/json") || (opts.multipart && ct.startsWith("multipart/form-data")))) {
    throw new AuthError("csrf");
  }
}

/**
 * Client IP for rate limiting. `X-Forwarded-For` is a list that clients can
 * pre-populate, so only entries appended by OUR trusted proxies count: we read
 * from the right, skipping `TRUSTED_PROXY_HOPS - 1` entries (default 1: the
 * last entry, appended by Google's front end, is the client). Never read the
 * left-most entry — an attacker controls it and could dodge every limit.
 * If the header has fewer entries than expected we fall back to the left-most.
 */
export function clientIp(req: Request, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string {
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const idx = parts.length - Math.max(1, hops);
  const ip = (idx >= 0 ? parts[idx] : parts[0]) || req.headers.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}
