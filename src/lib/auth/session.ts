import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { AuthError } from "./errors";
import { SESSION_COOKIE_NAME, SESSION_DEFAULT_MS, SESSION_REMEMBER_MS, isProd } from "@/lib/config";

export interface Session {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/** Newly issued ID tokens must be < 5 min old to be exchanged (Firebase rule). */
export async function createSessionCookieValue(idToken: string, remember: boolean) {
  const expiresIn = remember ? SESSION_REMEMBER_MS : SESSION_DEFAULT_MS;
  const value = await adminAuth().createSessionCookie(idToken, { expiresIn });
  return { value, expiresIn };
}

export function setSessionCookie(
  res: NextResponse,
  value: string,
  remember: boolean,
): void {
  res.cookies.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    // Session cookie (dies with the browser) unless the user opted in to "remember".
    ...(remember ? { maxAge: SESSION_REMEMBER_MS / 1000 } : {}),
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Verifies a raw session cookie value. checkRevoked=true makes Firebase
 * reject sessions issued before a password reset / explicit revocation /
 * account disablement. Returns null for any invalid session.
 */
export async function verifySessionValue(value: string | undefined): Promise<Session | null> {
  if (!value) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(value, true);
    let emailVerified = decoded.email_verified === true;
    let name = (decoded.name as string | undefined) ?? null;
    if (!emailVerified || !name) {
      // Claims are frozen at issue time (e.g. a token minted before the display
      // name was saved, or before the email was verified). Consult the live
      // record so changes take effect without forcing a new login.
      const user = await adminAuth().getUser(decoded.uid);
      emailVerified = emailVerified || user.emailVerified;
      name = name ?? user.displayName ?? null;
    }
    return { uid: decoded.uid, email: decoded.email ?? "", emailVerified, name };
  } catch {
    return null;
  }
}

/** Per-request memoized session lookup for server components and actions. */
export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  return verifySessionValue(jar.get(SESSION_COOKIE_NAME)?.value);
});

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError("unauthenticated");
  return s;
}

export async function requireVerifiedSession(): Promise<Session> {
  const s = await requireSession();
  if (!s.emailVerified) throw new AuthError("email_unverified");
  return s;
}

/** For pages/layouts: redirects instead of throwing. */
export async function requirePageSession(opts: { verified: boolean } = { verified: true }): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (opts.verified && !s.emailVerified) redirect("/verify-email");
  return s;
}
