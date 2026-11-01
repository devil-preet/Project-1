import { describe, expect, it } from "vitest";
import { draftDataSchema, draftSaveSchema, onboardingSchema } from "@/lib/validations/onboarding";
import { sniffImage } from "@/services/onboarding.service";
import { pickActiveBusiness } from "@/services/business.service";
import { RESERVED_SLUGS, isValidSlug, slugCandidate, slugify } from "@/lib/utils/slug";
import type { Membership } from "@/types";

const minimal = { businessName: "Tiny Shop", industry: "Other", storeDisplayName: "Tiny Shop" };

describe("onboardingSchema", () => {
  it("requires only name, industry and store name; fills safe defaults", () => {
    const r = onboardingSchema.parse(minimal);
    expect(r).toMatchObject({
      description: "", contactEmail: "", contactPhone: "", slug: "", storeStatus: "unpublished",
      primaryColor: "#111827", defaultTheme: "light",
    });
  });
  it("strips unknown keys so role / owner / tenant ids can never be smuggled in", () => {
    const r = onboardingSchema.parse({ ...minimal, role: "OWNER", ownerId: "x", businessId: "y", uid: "z" });
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(["role", "ownerId", "businessId", "uid"]));
  });
  it("normalises email and slug case", () => {
    const r = onboardingSchema.parse({ ...minimal, contactEmail: " Hi@Example.COM ", slug: " My-Shop " });
    expect(r.contactEmail).toBe("hi@example.com");
    expect(r.slug).toBe("my-shop");
  });
  it.each(["#fff", "red", "#12345G", "111827", "#1234567"])("rejects color %s", (c) => {
    expect(onboardingSchema.safeParse({ ...minimal, primaryColor: c }).success).toBe(false);
  });
});

describe("draft schema", () => {
  it("never injects defaults, so saving one field cannot overwrite the others", () => {
    expect(draftDataSchema.parse({ businessName: "Acme" })).toEqual({ businessName: "Acme" });
    expect(draftDataSchema.parse({})).toEqual({});
  });
  it("still validates the fields that are present", () => {
    expect(draftDataSchema.safeParse({ primaryColor: "nope" }).success).toBe(false);
    expect(draftDataSchema.safeParse({ slug: "Bad Slug" }).success).toBe(false);
  });
  it("bounds the step number", () => {
    expect(draftSaveSchema.safeParse({ step: 0, data: {} }).success).toBe(false);
    expect(draftSaveSchema.safeParse({ step: 5, data: {} }).success).toBe(false);
    expect(draftSaveSchema.safeParse({ step: 4, data: {} }).success).toBe(true);
  });
});

describe("sniffImage (content-based type detection)", () => {
  it("recognises PNG, JPEG and WebP by magic bytes", () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.contentType).toBe("image/png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.contentType).toBe("image/jpeg");
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))?.contentType).toBe("image/webp");
  });
  it("rejects everything else (SVG, GIF, HTML, PDF, truncated, empty)", () => {
    for (const s of ["<svg></svg>", "GIF89a", "<html>", "%PDF-1.7", "\x89PN", "RIFF\0\0\0\0WAVEfmt "]) {
      expect(sniffImage(Buffer.from(s, "binary")), s).toBeNull();
    }
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe("slug rules for storefront URLs", () => {
  it("reserves platform and route words", () => {
    for (const w of ["admin", "api", "s", "new", "dashboard", "onboarding", "login"]) {
      expect(RESERVED_SLUGS.has(w), w).toBe(true);
      expect(isValidSlug(w), w).toBe(false);
    }
  });
  it("derives clean slugs and numbered fallbacks", () => {
    expect(slugify("Northstar Clothing")).toBe("northstar-clothing");
    expect(slugify("Urban  Thread!!")).toBe("urban-thread");
    expect(slugCandidate("urban-thread", 2)).toBe("urban-thread-2");
  });
});

describe("pickActiveBusiness", () => {
  const m = (id: string): Membership => ({
    businessId: id, role: "OWNER",
    business: { id, name: id, slug: id, storeStatus: "unpublished", industry: "Other" },
  });
  const list = [m("a"), m("b")];
  it("prefers a verified requested id, then last-used, then first", () => {
    expect(pickActiveBusiness(list, "b", "a")?.active.businessId).toBe("b");
    expect(pickActiveBusiness(list, null, "b")?.active.businessId).toBe("b");
    expect(pickActiveBusiness(list, null, null)?.active.businessId).toBe("a");
    expect(pickActiveBusiness(list, null, "gone")?.active.businessId).toBe("a");
  });
  it("ignores a requested id that is not a membership and flags it", () => {
    expect(pickActiveBusiness(list, "victim", "a")).toMatchObject({ active: { businessId: "a" }, requestedDenied: true });
  });
  it("returns null without memberships", () => {
    expect(pickActiveBusiness([], "a", "a")).toBeNull();
  });
});
