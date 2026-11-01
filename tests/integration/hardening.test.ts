import { beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { PASSWORD, apiRequest, cookieValue, freshIp, registerBody, resetEmulators, sessionCookieOf } from "./helpers";

const EMAIL = "grace@example.com";

beforeEach(async () => {
  await resetEmulators();
  await register(apiRequest("/api/auth/register", registerBody(EMAIL)));
});

const jwtPayload = (jwt: string) =>
  JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")) as { iat: number; exp: number };

describe("session expiration", () => {
  it("'remember me' sessions last 14 days; default sessions last 12 hours", async () => {
    const remembered = sessionCookieOf(await login(apiRequest("/api/auth/login", { email: EMAIL, password: PASSWORD, remember: true })))!;
    const short = sessionCookieOf(await login(apiRequest("/api/auth/login", { email: EMAIL, password: PASSWORD })))!;
    const r = jwtPayload(cookieValue(remembered));
    const s = jwtPayload(cookieValue(short));
    expect(r.exp - r.iat).toBe(14 * 24 * 3600);
    expect(s.exp - s.iat).toBe(12 * 3600);
  });
});

describe("rate limiting cannot be dodged by spoofing X-Forwarded-For", () => {
  it("rotating the client-controlled left-most entry does not reset the limit", async () => {
    const realClient = freshIp(); // the entry appended by our trusted proxy (right-most)
    const attempt = (spoof: string) =>
      login(
        apiRequest("/api/auth/login", { email: EMAIL, password: "Wrong-password-1" }, {
          headers: { "x-forwarded-for": `${spoof}, ${realClient}` },
        }),
      );
    for (let i = 0; i < 5; i++) expect((await attempt(`6.6.6.${i}`)).status).toBe(401);
    expect((await attempt("6.6.6.200")).status).toBe(429);
  });
});

describe("cross-IP backstop", () => {
  it("20 failed logins/hour for one email from many IPs trigger a limit", async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await login(apiRequest("/api/auth/login", { email: EMAIL, password: "Wrong-password-1" }, { ip: freshIp() }))).status;
    }
    expect(last).toBe(429);
  });
});
