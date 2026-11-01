import { describe, expect, it } from "vitest";
import { categoryAction, productAction, productFields, productListQuery, settingsAction } from "@/lib/validations/catalog";
import { centsToInput, formatMoney, parseMoney } from "@/lib/utils/money";
import { categoryQueryPlan, productQueryPlan } from "@/lib/catalog/query-plan";
import { luminance, mix, readableOn, storefrontVars } from "@/lib/catalog/theme";
import { can } from "@/lib/permissions";

describe("money (integer minor units, no floats)", () => {
  it("parses plain decimal strings exactly", () => {
    expect(parseMoney("12")).toBe(1200);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("12.50")).toBe(1250);
    expect(parseMoney("0.07")).toBe(7);
    expect(parseMoney("1,299.99")).toBe(129999);
    expect(parseMoney("19.99")).toBe(1999); // would be 1998.9999999999998 with float maths
    expect(parseMoney("0")).toBe(0);
  });
  it("rejects negatives, junk, extra precision and absurd amounts", () => {
    for (const bad of ["", "-1", "abc", "1.234", "1e3", "1..2", ".5", "99999999999", "12.5.1", " "]) expect(parseMoney(bad), bad).toBeNull();
  });
  it("round-trips for form inputs and formats with the currency", () => {
    expect(centsToInput(1250)).toBe("12.50");
    expect(centsToInput(5)).toBe("0.05");
    expect(parseMoney(centsToInput(129999))).toBe(129999);
    expect(formatMoney(129900, "INR")).toContain("1,299");
    expect(formatMoney(100, "NOPE")).toContain("1"); // unknown currency falls back to INR rather than throwing
  });
});

describe("product validation", () => {
  const base = { name: "Shirt", categoryId: "cat1", description: "Nice", priceCents: 100 };
  const parse = (over: Record<string, unknown>) => productFields.safeParse({ ...base, ...over });

  it("applies defaults and accepts the minimal product", () => {
    const r = parse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ status: "draft", availability: "in_stock", featured: false, imageIds: [], compareAtPriceCents: null, slug: "" });
  });
  it("rejects non-integer, negative and huge prices, and compare-at below price", () => {
    for (const priceCents of [1.5, -1, "5", null, 2_000_000_000]) expect(parse({ priceCents }).success, String(priceCents)).toBe(false);
    expect(parse({ compareAtPriceCents: 100 }).success).toBe(false);
    expect(parse({ compareAtPriceCents: 101 }).success).toBe(true);
  });
  it("requires an image to be active, caps images, rejects duplicates", () => {
    expect(parse({ status: "active" }).success).toBe(false);
    expect(parse({ status: "active", imageIds: ["m1"] }).success).toBe(true);
    expect(parse({ imageIds: Array.from({ length: 11 }, (_, i) => `m${i}`) }).success).toBe(false);
    expect(parse({ imageIds: ["m1", "m1"] }).success).toBe(false);
  });
  it("rejects markup, bad slugs, bad ids and unknown statuses", () => {
    expect(parse({ name: "<script>" }).success).toBe(false);
    expect(parse({ slug: "Bad Slug" }).success).toBe(false);
    expect(parse({ categoryId: "../x" }).success).toBe(false);
    expect(parse({ status: "published" }).success).toBe(false);
    expect(parse({ stockQuantity: -1 }).success).toBe(false);
  });
  it("action unions reject unknown actions and strip smuggled keys", () => {
    expect(productAction.safeParse({ action: "drop" }).success).toBe(false);
    const r = categoryAction.safeParse({ action: "create", name: "Cat", businessId: "other", role: "OWNER" });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data)).not.toContain("businessId");
    expect(settingsAction.safeParse({ action: "branding", primaryColor: "red", secondaryColor: "#000000", accentColor: "#000000", defaultTheme: "light", logoId: null }).success).toBe(false);
    expect(settingsAction.safeParse({ action: "store", displayName: "Ok", description: "", currency: "BTC" }).success).toBe(false);
  });
  it("list query falls back to defaults for invalid filters instead of throwing", () => {
    expect(productListQuery.parse({ status: "bogus", order: "x", categoryId: "../", cursor: "a b" })).toEqual({});
    expect(productListQuery.parse({ status: "draft", order: "price-asc" })).toMatchObject({ status: "draft", order: "price-asc" });
  });
});

describe("query plans", () => {
  it("search forces ordering by searchName; filters become equality fields", () => {
    expect(productQueryPlan({ q: "Ab", status: "active", sort: "price" })).toMatchObject({ equality: ["status"], orderBy: "searchName", prefix: "ab" });
    expect(productQueryPlan({ categoryId: "c", status: "draft", sort: "price", dir: "desc" })).toMatchObject({ equality: ["categoryId", "status"], orderBy: "priceCents", dir: "desc", prefix: null });
    expect(productQueryPlan({}).orderBy).toBe("createdAt");
    expect(categoryQueryPlan({ q: "x" }).orderBy).toBe("searchName");
    expect(categoryQueryPlan({}).orderBy).toBe("sortOrder");
  });
});

describe("storefront theme (Nova)", () => {
  it("picks readable foregrounds", () => {
    expect(readableOn("#FFFFFF")).toBe("#111111");
    expect(readableOn("#0B0F19")).toBe("#FFFFFF");
    expect(readableOn("#2563EB")).toBe("#FFFFFF");
  });
  it("dark mode uses the Everloom base; light mode a light surface", () => {
    const base = { primary: "#7C2D12", secondary: "#78716C", accent: "#D9B8F4" };
    const dark = storefrontVars({ ...base, mode: "dark" });
    expect(dark["--sf-bg"]).toBe("#100E13");
    expect(dark["--sf-fg"]).toBe("#F8F3F7");
    expect(dark["--sf-accent"]).toBe("#D9B8F4"); // already legible: unchanged
    expect(storefrontVars({ ...base, mode: "light" })["--sf-bg"]).toBe("#FAF7F9");
  });
  it("lightens an accent that would vanish on the dark base, darkens one that would vanish on light", () => {
    const darkAccent = storefrontVars({ primary: "#111827", secondary: "#6B7280", accent: "#111827", mode: "dark" })["--sf-accent"];
    expect(luminance(darkAccent)).toBeGreaterThanOrEqual(0.3);
    const paleAccent = storefrontVars({ primary: "#FFFFFF", secondary: "#6B7280", accent: "#F5F5F5", mode: "light" })["--sf-accent"];
    expect(luminance(paleAccent)).toBeLessThanOrEqual(0.4);
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });
});

describe("role matrix for the catalogue", () => {
  it("matches the spec", () => {
    const row = (r: "OWNER" | "ADMIN" | "MANAGER" | "EDITOR") =>
      (["category:write", "category:delete", "product:write", "product:publish", "product:delete", "media:upload", "settings:update", "branding:update"] as const).map((p) => can(r, p));
    expect(row("OWNER")).toEqual([true, true, true, true, true, true, true, true]);
    expect(row("ADMIN")).toEqual([true, true, true, true, true, true, true, true]);
    expect(row("MANAGER")).toEqual([true, true, true, true, true, true, false, true]);
    expect(row("EDITOR")).toEqual([false, false, true, false, false, true, false, false]);
  });
});
