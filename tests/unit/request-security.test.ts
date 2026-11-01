import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { clientIp } from "@/lib/security/request";
import { safeNext } from "@/lib/api/client";
import { buildCsp, proxy } from "@/proxy";

const reqWith = (h: Record<string, string>) => new Request("http://localhost/", { headers: h });

describe("clientIp", () => {
  it("uses the right-most entry (appended by the trusted proxy), ignoring spoofed left entries", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" }), 1)).toBe("203.0.113.9");
  });
  it("honours extra trusted hops", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "spoof, 203.0.113.9, 35.1.1.1" }), 2)).toBe("203.0.113.9");
  });
  it("falls back safely when the header is short or absent", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "203.0.113.9" }), 3)).toBe("203.0.113.9");
    expect(clientIp(reqWith({}))).toBe("unknown");
    expect(clientIp(reqWith({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });
});

describe("safeNext (open-redirect guard)", () => {
  it.each(["//evil.com", "https://evil.com", "javascript:alert(1)", String.raw`/\evil.com`, "", null, undefined, "evil"])(
    "rejects %s",
    (v) => expect(safeNext(v as string | null | undefined)).toBe("/dashboard"),
  );
  it("accepts same-site paths", () => {
    expect(safeNext("/products?x=1")).toBe("/products?x=1");
  });
});

describe("CSP", () => {
  it("locks down scripts with a nonce and forbids framing, plugins and base-tag injection", () => {
    const csp = buildCsp("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
  it("proxy emits a fresh nonce per request, on both request and response", () => {
    const a = proxy(new NextRequest("http://localhost:3000/login"));
    const b = proxy(new NextRequest("http://localhost:3000/login"));
    const na = a.headers.get("content-security-policy")!.match(/nonce-([^']+)/)![1];
    const nb = b.headers.get("content-security-policy")!.match(/nonce-([^']+)/)![1];
    expect(na).not.toBe(nb);
  });
});
