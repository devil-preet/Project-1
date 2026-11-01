/** Non-secret runtime constants shared by the server modules. */

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "__session";

/** Firebase caps session cookies at 14 days. */
export const SESSION_REMEMBER_MS = 14 * 24 * 60 * 60 * 1000;
/** Without "remember me" the cookie is a browser-session cookie, valid at most 12h server-side. */
export const SESSION_DEFAULT_MS = 12 * 60 * 60 * 1000;

export const isProd = process.env.NODE_ENV === "production";

export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Routes that require an authenticated, verified session (proxy + layouts). */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/b",
  "/products",
  "/categories",
  "/branding",
  "/media",
  "/team",
  "/settings",
  "/onboarding",
  "/verify-email",
] as const;
