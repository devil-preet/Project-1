export type AuthErrorCode =
  | "invalid_input"
  | "invalid_credentials"
  | "email_exists"
  | "email_unverified"
  | "unauthenticated"
  | "forbidden"
  | "invalid_code"
  | "expired_code"
  | "rate_limited"
  | "account_disabled"
  | "csrf"
  | "slug_taken"
  | "limit_reached"
  | "not_found"
  | "conflict"
  | "internal";

const STATUS: Record<AuthErrorCode, number> = {
  invalid_input: 400,
  invalid_credentials: 401,
  email_exists: 409,
  email_unverified: 403,
  unauthenticated: 401,
  forbidden: 403,
  invalid_code: 400,
  expired_code: 400,
  rate_limited: 429,
  account_disabled: 403,
  csrf: 403,
  slug_taken: 409,
  limit_reached: 403,
  not_found: 404,
  conflict: 409,
  internal: 500,
};

/** User-safe messages. Never include provider internals. */
const MESSAGES: Record<AuthErrorCode, string> = {
  invalid_input: "Please check the highlighted fields and try again.",
  invalid_credentials: "Incorrect email or password.",
  email_exists: "An account with this email already exists. Try signing in instead.",
  email_unverified: "Please verify your email address to continue.",
  unauthenticated: "Please sign in to continue.",
  forbidden: "You don't have permission to do that.",
  invalid_code: "This link is invalid or has already been used.",
  expired_code: "This link has expired. Please request a new one.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  account_disabled: "This account has been disabled. Contact support.",
  slug_taken: "That store address is already taken.",
  limit_reached: "You have reached the maximum number of businesses for this account.",
  not_found: "We could not find what you were looking for.",
  conflict: "That change conflicts with the current state. Reload and try again.",
  csrf: "Request blocked for security reasons. Reload the page and try again.",
  internal: "Something went wrong on our side. Please try again.",
};

export class AuthError extends Error {
  readonly status: number;
  constructor(
    readonly code: AuthErrorCode,
    message?: string,
    readonly extra?: { retryAfterSec?: number; fieldErrors?: Record<string, string[]> },
  ) {
    super(message ?? MESSAGES[code]);
    this.name = "AuthError";
    this.status = STATUS[code];
  }
}
