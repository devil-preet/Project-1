import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const get = (path: string, cookie?: string) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} }));

describe("proxy route protection", () => {
  it.each(["/dashboard", "/products", "/products/abc", "/categories", "/team", "/settings", "/onboarding", "/branding", "/media"])(
    "redirects unauthenticated %s to /login with return path",
    (path) => {
      const res = get(path);
      expect(res.status).toBe(307);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.pathname).toBe("/login");
      expect(loc.searchParams.get("next")).toBe(path);
    },
  );

  it("lets requests with a session cookie through (verification happens server-side)", () => {
    expect(get("/dashboard", "__session=abc").status).toBe(200);
  });

  it("leaves public routes alone", () => {
    for (const p of ["/login", "/register", "/forgot-password", "/auth/action", "/"]) {
      expect(get(p).headers.get("location"), p).toBeNull();
    }
  });

  it("does not treat lookalike prefixes as protected", () => {
    expect(get("/dashboardx").headers.get("location")).toBeNull();
  });
});
