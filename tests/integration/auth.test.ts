import { beforeEach, describe, expect, it } from "vitest";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { verifySessionValue } from "@/lib/auth/session";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as resetPw } from "@/app/api/auth/reset-password/route";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as resend } from "@/app/api/auth/resend-verification/route";
import { GET as sessionProbe } from "@/app/api/auth/session/route";
import { NextRequest } from "next/server";
import {
  PASSWORD, apiRequest, cookieValue, freshIp, oobCodes, registerBody,
  resetEmulators, sessionCookieOf, sleep,
} from "./helpers";

const EMAIL = "ada@example.com";

beforeEach(resetEmulators);

async function registerAda(email = EMAIL) {
  const res = await register(apiRequest("/api/auth/register", registerBody(email)));
  return { res, cookie: sessionCookieOf(res)! };
}

describe("registration", () => {
  it("creates the account, profile, verification email and an HttpOnly session", async () => {
    const { res, cookie } = await registerAda();
    expect(res.status).toBe(200);
    expect(await res.clone().json()).toMatchObject({ ok: true, emailVerified: false, verificationEmailSent: true });

    const setCookie = res.headers.get("set-cookie")!.toLowerCase();
    expect(setCookie).toContain("httponly");
    expect(setCookie).toContain("samesite=lax");
    expect(setCookie).not.toContain("max-age"); // browser-session cookie

    const user = await adminAuth().getUserByEmail(EMAIL);
    expect(user.displayName).toBe("Ada Lovelace");
    expect(user.emailVerified).toBe(false);

    const profile = (await adminDb().doc(`users/${user.uid}`).get()).data()!;
    expect(profile).toMatchObject({ uid: user.uid, email: EMAIL, fullName: "Ada Lovelace", lastBusinessId: null });
    expect(profile.createdAt).toBeDefined();

    expect(await oobCodes(EMAIL, "VERIFY_EMAIL")).toHaveLength(1);

    const session = await verifySessionValue(cookieValue(cookie));
    expect(session).toMatchObject({ uid: user.uid, email: EMAIL, emailVerified: false });
  });

  it("rejects a duplicate email with a friendly 409", async () => {
    await registerAda();
    const res = await register(apiRequest("/api/auth/register", registerBody(EMAIL)));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("email_exists");
  });

  it("rejects invalid input with field errors and creates nothing", async () => {
    const res = await register(
      apiRequest("/api/auth/register", registerBody("not-an-email", { password: "weak", confirmPassword: "nope" })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.email).toBeDefined();
    expect(body.fieldErrors.password).toBeDefined();
    expect((await adminAuth().listUsers()).users).toHaveLength(0);
  });

  it("rejects mismatched confirmation and passwords containing the email name", async () => {
    const mismatch = await register(
      apiRequest("/api/auth/register", registerBody(EMAIL, { confirmPassword: PASSWORD + "x" })),
    );
    expect((await mismatch.json()).fieldErrors.confirmPassword).toBeDefined();

    const containsName = await register(
      apiRequest("/api/auth/register", registerBody("hunter@example.com", { password: "Hunter12345!", confirmPassword: "Hunter12345!" })),
    );
    expect(containsName.status).toBe(400);
  });

  it("survives a failed profile write: login self-heals the profile", async () => {
    const { res } = await registerAda();
    expect(res.status).toBe(200);
    const user = await adminAuth().getUserByEmail(EMAIL);
    await adminDb().doc(`users/${user.uid}`).delete(); // simulate interrupted registration

    const res2 = await login(apiRequest("/api/auth/login", { email: EMAIL, password: PASSWORD }));
    expect(res2.status).toBe(200);
    expect((await adminDb().doc(`users/${user.uid}`).get()).exists).toBe(true);
  });
});

describe("login", () => {
  beforeEach(async () => {
    await registerAda();
  });

  it("wrong password and unknown email produce the identical generic error", async () => {
    const wrong = await login(apiRequest("/api/auth/login", { email: EMAIL, password: "Wrong-password-1" }));
    const unknown = await login(apiRequest("/api/auth/login", { email: "ghost@example.com", password: "Wrong-password-1" }));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const [a, b] = [await wrong.json(), await unknown.json()];
    expect(a.error).toBe(b.error);
    expect(a.code).toBe("invalid_credentials");
    expect(sessionCookieOf(wrong)).toBeNull();
  });

  it("issues a persistent cookie only when 'remember me' is set", async () => {
    const without = await login(apiRequest("/api/auth/login", { email: EMAIL, password: PASSWORD }));
    expect(without.headers.get("set-cookie")!.toLowerCase()).not.toContain("max-age");

    const withRemember = await login(apiRequest("/api/auth/login", { email: EMAIL, password: PASSWORD, remember: true }));
    expect(withRemember.headers.get("set-cookie")!.toLowerCase()).toContain(`max-age=${14 * 24 * 3600}`);
  });

  it("normalizes email case and whitespace", async () => {
    const res = await login(apiRequest("/api/auth/login", { email: "  ADA@Example.com ", password: PASSWORD }));
    expect(res.status).toBe(200);
  });

  it("rate limits repeated failures per IP+email (429 + Retry-After), without blocking other IPs", async () => {
    const ip = freshIp();
    const attempt = (i = ip) =>
      login(apiRequest("/api/auth/login", { email: EMAIL, password: "Wrong-password-1" }, { ip: i }));
    for (let n = 0; n < 5; n++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // Even the correct password is refused while limited.
    const correct = await login(apiRequest("/api/auth/login", { email: EMAIL, password: PASSWORD }, { ip }));
    expect(correct.status).toBe(429);
    // A different IP is unaffected.
    expect((await attempt(freshIp())).status).toBe(401);
  });
});

describe("email verification", () => {
  it("verifying via the emailed code unlocks the existing session without re-login", async () => {
    const { cookie } = await registerAda();
    const [{ oobCode }] = await oobCodes(EMAIL, "VERIFY_EMAIL");

    const res = await verifyEmail(apiRequest("/api/auth/verify-email", { oobCode }));
    expect(res.status).toBe(200);

    const session = await verifySessionValue(cookieValue(cookie));
    expect(session?.emailVerified).toBe(true);
  });

  it("rejects bogus and reused codes", async () => {
    await registerAda();
    const bogus = await verifyEmail(apiRequest("/api/auth/verify-email", { oobCode: "x".repeat(24) }));
    expect(bogus.status).toBe(400);

    const [{ oobCode }] = await oobCodes(EMAIL, "VERIFY_EMAIL");
    await verifyEmail(apiRequest("/api/auth/verify-email", { oobCode }));
    const reuse = await verifyEmail(apiRequest("/api/auth/verify-email", { oobCode }));
    expect(reuse.status).toBe(400);
  });

  it("resend: requires a session, sends a new email, and reports already-verified", async () => {
    const anon = await resend(apiRequest("/api/auth/resend-verification", {}));
    expect(anon.status).toBe(401);

    const { cookie } = await registerAda();
    const before = (await oobCodes(EMAIL, "VERIFY_EMAIL")).length;
    const res = await resend(apiRequest("/api/auth/resend-verification", {}, { cookie }));
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyVerified).toBe(false);
    expect((await oobCodes(EMAIL, "VERIFY_EMAIL")).length).toBe(before + 1);

    const user = await adminAuth().getUserByEmail(EMAIL);
    await adminAuth().updateUser(user.uid, { emailVerified: true });
    const again = await resend(apiRequest("/api/auth/resend-verification", {}, { cookie }));
    expect((await again.json()).alreadyVerified).toBe(true);
  });

  it("limits resend to 3 per hour per user", async () => {
    const { cookie } = await registerAda();
    for (let i = 0; i < 3; i++) {
      expect((await resend(apiRequest("/api/auth/resend-verification", {}, { cookie }))).status).toBe(200);
    }
    expect((await resend(apiRequest("/api/auth/resend-verification", {}, { cookie }))).status).toBe(429);
  });
});

describe("password reset", () => {
  it("answers identically for known and unknown emails (no enumeration)", async () => {
    await registerAda();
    const known = await forgot(apiRequest("/api/auth/forgot-password", { email: EMAIL }));
    const unknown = await forgot(apiRequest("/api/auth/forgot-password", { email: "ghost@example.com" }));
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect(await oobCodes(EMAIL, "PASSWORD_RESET")).toHaveLength(1);
    expect(await oobCodes("ghost@example.com", "PASSWORD_RESET")).toHaveLength(0);
  });

  it("changes the password, kills old sessions, and the code is single-use", async () => {
    const { cookie: oldSession } = await registerAda();
    await forgot(apiRequest("/api/auth/forgot-password", { email: EMAIL }));
    const [{ oobCode }] = await oobCodes(EMAIL, "PASSWORD_RESET");

    await sleep(1100); // session revocation has 1s granularity
    const NEW = "BrandNewPassw0rd!";
    const res = await resetPw(apiRequest("/api/auth/reset-password", { oobCode, password: NEW, confirmPassword: NEW }));
    expect(res.status).toBe(200);

    expect((await login(apiRequest("/api/auth/login", { email: EMAIL, password: PASSWORD }))).status).toBe(401);
    expect((await login(apiRequest("/api/auth/login", { email: EMAIL, password: NEW }))).status).toBe(200);
    expect(await verifySessionValue(cookieValue(oldSession))).toBeNull();

    const reuse = await resetPw(apiRequest("/api/auth/reset-password", { oobCode, password: NEW, confirmPassword: NEW }));
    expect(reuse.status).toBe(400);
  });

  it("enforces the password policy on reset", async () => {
    const res = await resetPw(
      apiRequest("/api/auth/reset-password", { oobCode: "x".repeat(24), password: "weak", confirmPassword: "weak" }),
    );
    expect(res.status).toBe(400);
  });

  it("limits reset emails to 3/hour per IP+email", async () => {
    const ip = freshIp();
    const send = () => forgot(apiRequest("/api/auth/forgot-password", { email: EMAIL }, { ip }));
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });
});

describe("sessions", () => {
  it("rejects missing, garbage and tampered cookies", async () => {
    expect(await verifySessionValue(undefined)).toBeNull();
    expect(await verifySessionValue("garbage")).toBeNull();
    const { cookie } = await registerAda();
    expect(await verifySessionValue(cookieValue(cookie) + "x")).toBeNull();
  });

  it("logout clears the cookie", async () => {
    const { cookie } = await registerAda();
    const res = await logout(apiRequest("/api/auth/logout", {}, { cookie }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!.toLowerCase();
    expect(setCookie).toContain("max-age=0");
    expect(sessionCookieOf(res)).toBeNull();
  });

  it("sign-out-everywhere revokes previously issued sessions (revocation check)", async () => {
    const { cookie } = await registerAda();
    const other = sessionCookieOf(await login(apiRequest("/api/auth/login", { email: EMAIL, password: PASSWORD })))!;
    await sleep(1100);
    await logout(apiRequest("/api/auth/logout", { everywhere: true }, { cookie }));
    expect(await verifySessionValue(cookieValue(cookie))).toBeNull();
    expect(await verifySessionValue(cookieValue(other))).toBeNull();
  });

  it("a disabled account loses its session immediately", async () => {
    const { cookie } = await registerAda();
    const user = await adminAuth().getUserByEmail(EMAIL);
    await adminAuth().updateUser(user.uid, { disabled: true });
    expect(await verifySessionValue(cookieValue(cookie))).toBeNull();
    const res = await login(apiRequest("/api/auth/login", { email: EMAIL, password: PASSWORD }));
    expect(res.status).toBe(403);
  });

  it("GET /api/auth/session reports state and never caches", async () => {
    const { cookie } = await registerAda();
    const withCookie = await sessionProbe(
      new NextRequest("http://localhost:3000/api/auth/session", { headers: { cookie } }),
    );
    expect(await withCookie.json()).toEqual({ authenticated: true, emailVerified: false });
    expect(withCookie.headers.get("cache-control")).toBe("no-store");
    const anon = await sessionProbe(new NextRequest("http://localhost:3000/api/auth/session"));
    expect(await anon.json()).toEqual({ authenticated: false, emailVerified: false });
  });
});

describe("CSRF / request hardening", () => {
  const body = { email: EMAIL, password: PASSWORD };
  const cases: [string, Record<string, string | null>][] = [
    ["cross-site Sec-Fetch-Site", { "sec-fetch-site": "cross-site" }],
    ["same-site (sibling subdomain) Sec-Fetch-Site", { "sec-fetch-site": "same-site" }],
    ["foreign Origin", { origin: "https://evil.example", "sec-fetch-site": null }],
    ["missing X-Requested-With", { "x-requested-with": null }],
    ["form content-type", { "content-type": "application/x-www-form-urlencoded" }],
    ["no Origin and no Sec-Fetch-Site", { origin: null, "sec-fetch-site": null }],
  ];
  it.each(cases)("blocks %s", async (_name, headers) => {
    await registerAda();
    const res = await login(apiRequest("/api/auth/login", body, { headers }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("csrf");
    expect(sessionCookieOf(res)).toBeNull();
  });

  it("rejects malformed JSON and oversized bodies without leaking internals", async () => {
    const bad = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin",
        "x-requested-with": "fetch", "content-type": "application/json",
      },
      body: "{not json",
    });
    expect((await login(bad)).status).toBe(400);

    const big = apiRequest("/api/auth/login", { email: EMAIL, password: "x".repeat(20_000) });
    const res = await login(big);
    expect(res.status).toBe(400);
  });
});
