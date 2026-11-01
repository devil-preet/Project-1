import "server-only";
import { adminAuth } from "./admin";
import { AuthError } from "@/lib/auth/errors";

/**
 * Thin server-side client for the Firebase Auth (Identity Toolkit) REST API.
 * Credentials never touch the browser SDK; every call is made from our server
 * so it can be rate limited and audited. Targets the Auth emulator when
 * FIREBASE_AUTH_EMULATOR_HOST is set.
 */
function base(): string {
  const emu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return emu
    ? `http://${emu}/identitytoolkit.googleapis.com/v1`
    : "https://identitytoolkit.googleapis.com/v1";
}

interface IdentityFailure {
  /** Raw provider code, e.g. "INVALID_LOGIN_CREDENTIALS". Never shown to users. */
  providerCode: string;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) throw new AuthError("internal");
  const res = await fetch(`${base()}/${path}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000), // never let a provider stall hold a request open
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    const providerCode = String(json.error?.message ?? "UNKNOWN").split(" ")[0];
    throw Object.assign(new Error(providerCode), { providerCode } satisfies IdentityFailure);
  }
  return json;
}

/** Maps provider failures to our user-safe error codes. */
export function mapIdentityError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const code = (e as Partial<IdentityFailure>)?.providerCode;
  switch (code) {
    case "EMAIL_EXISTS":
      return new AuthError("email_exists");
    case "INVALID_LOGIN_CREDENTIALS":
    case "INVALID_PASSWORD":
    case "EMAIL_NOT_FOUND":
    case "INVALID_EMAIL":
      return new AuthError("invalid_credentials");
    case "USER_DISABLED":
      return new AuthError("account_disabled");
    case "TOO_MANY_ATTEMPTS_TRY_LATER":
      return new AuthError("rate_limited");
    case "EXPIRED_OOB_CODE":
      return new AuthError("expired_code");
    case "INVALID_OOB_CODE":
      return new AuthError("invalid_code");
    case "WEAK_PASSWORD":
      return new AuthError("invalid_input", "Choose a stronger password.");
    default:
      console.error("[identity] unexpected provider error:", code ?? e);
      return new AuthError("internal");
  }
}

export interface IdTokenResult {
  idToken: string;
  localId: string;
}

export const signUpWithPassword = (email: string, password: string) =>
  call<IdTokenResult>("accounts:signUp", { email, password, returnSecureToken: true });

export const signInWithPassword = (email: string, password: string) =>
  call<IdTokenResult>("accounts:signInWithPassword", { email, password, returnSecureToken: true });

export const sendVerificationEmail = (idToken: string, continueUrl: string) =>
  call("accounts:sendOobCode", { requestType: "VERIFY_EMAIL", idToken, continueUrl });

export const sendPasswordResetEmail = (email: string, continueUrl: string) =>
  call("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email, continueUrl });

export const confirmPasswordResetCode = (oobCode: string, newPassword: string) =>
  call("accounts:resetPassword", { oobCode, newPassword });

export const confirmVerificationCode = (oobCode: string) =>
  call<{ email: string }>("accounts:update", { oobCode });

/**
 * Exchanges a server-minted custom token for an ID token so we can act for a
 * user who has a valid session but no password in hand (e.g. resend verification).
 * Requires token-signing ability: automatic on App Hosting / Cloud Run; locally set
 * FIREBASE_AUTH_SERVICE_ACCOUNT_ID and grant yourself Service Account Token Creator.
 */
export async function mintIdTokenFor(uid: string): Promise<string> {
  const customToken = await adminAuth().createCustomToken(uid);
  const { idToken } = await call<IdTokenResult>("accounts:signInWithCustomToken", {
    token: customToken,
    returnSecureToken: true,
  });
  return idToken;
}
