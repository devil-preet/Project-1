import "server-only";
import { adminAuth } from "@/lib/firebase/admin";
import {
  confirmPasswordResetCode,
  confirmVerificationCode,
  mapIdentityError,
  mintIdTokenFor,
  sendPasswordResetEmail,
  sendVerificationEmail,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/firebase/identity";
import { createSessionCookieValue } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/errors";
import { appUrl } from "@/lib/config";
import type { LoginInput, RegisterInput } from "@/lib/validations/auth";
import { ensureUserProfile } from "./user.service";

export interface SessionIssued {
  uid: string;
  emailVerified: boolean;
  cookieValue: string;
  remember: boolean;
}

/**
 * Registration is ordered so every partial failure is recoverable:
 *  1. Auth account (the only step that can fail "for real" — e.g. duplicate email).
 *  2. Display name, profile doc, verification email: best-effort. If any fails the
 *     account still works; login re-creates the profile and the verify page can resend.
 */
export async function registerUser(
  input: Pick<RegisterInput, "fullName" | "email" | "password">,
): Promise<SessionIssued & { verificationEmailSent: boolean }> {
  let created;
  try {
    created = await signUpWithPassword(input.email, input.password);
  } catch (e) {
    throw mapIdentityError(e);
  }
  const { idToken, localId: uid } = created;

  await adminAuth()
    .updateUser(uid, { displayName: input.fullName })
    .catch((e) => console.error("[register] displayName update failed:", e?.message ?? e));

  await ensureUserProfile({ uid, email: input.email, fullName: input.fullName }).catch((e) =>
    console.error("[register] profile creation failed (will self-heal at login):", e?.message ?? e),
  );

  const verificationEmailSent = await sendVerificationEmail(idToken, `${appUrl()}/verify-email`)
    .then(() => true)
    .catch((e) => {
      console.error("[register] verification email failed:", e?.providerCode ?? e?.message ?? e);
      return false;
    });

  const { value } = await createSessionCookieValue(idToken, false);
  return { uid, emailVerified: false, cookieValue: value, remember: false, verificationEmailSent };
}

export async function loginUser(input: LoginInput): Promise<SessionIssued> {
  let result;
  try {
    result = await signInWithPassword(input.email, input.password);
  } catch (e) {
    throw mapIdentityError(e);
  }
  const remember = input.remember === true;
  const decoded = await adminAuth().verifyIdToken(result.idToken);

  // Self-heal a missing profile (registration interrupted before it was written).
  await ensureUserProfile({
    uid: decoded.uid,
    email: decoded.email ?? input.email,
    fullName: (decoded.name as string | undefined) ?? (decoded.email ?? input.email).split("@")[0],
  }).catch((e) => console.error("[login] profile ensure failed:", e?.message ?? e));

  const { value } = await createSessionCookieValue(result.idToken, remember);
  return {
    uid: decoded.uid,
    emailVerified: decoded.email_verified === true,
    cookieValue: value,
    remember,
  };
}

/**
 * Always resolves, whether or not the address has an account, so the endpoint
 * cannot be used to enumerate users. Provider errors are logged, not surfaced.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(email, `${appUrl()}/login`);
  } catch (e) {
    const code = (e as { providerCode?: string }).providerCode;
    if (code !== "EMAIL_NOT_FOUND") console.error("[password-reset] send failed:", code ?? e);
  }
}

export async function completePasswordReset(oobCode: string, password: string): Promise<void> {
  try {
    await confirmPasswordResetCode(oobCode, password);
  } catch (e) {
    throw mapIdentityError(e);
  }
}

export async function completeEmailVerification(oobCode: string): Promise<void> {
  try {
    await confirmVerificationCode(oobCode);
  } catch (e) {
    throw mapIdentityError(e);
  }
}

export async function resendVerificationEmail(uid: string): Promise<{ alreadyVerified: boolean }> {
  const user = await adminAuth().getUser(uid);
  if (user.emailVerified) return { alreadyVerified: true };
  try {
    const idToken = await mintIdTokenFor(uid);
    await sendVerificationEmail(idToken, `${appUrl()}/verify-email`);
  } catch (e) {
    throw e instanceof AuthError ? e : mapIdentityError(e);
  }
  return { alreadyVerified: false };
}

/** Invalidates every session and refresh token for the user (all devices). */
export async function revokeAllSessions(uid: string): Promise<void> {
  await adminAuth().revokeRefreshTokens(uid);
}
