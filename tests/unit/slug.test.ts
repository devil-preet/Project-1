import { describe, expect, it } from "vitest";
import { isValidSlug, slugCandidate, slugify } from "@/lib/utils/slug";

describe("slugify", () => {
  it("normalizes accents, case, punctuation and ampersands", () => {
    expect(slugify("  Café & Co.  ")).toBe("cafe-and-co");
    expect(slugify("Hello___World!!")).toBe("hello-world");
  });
  it("returns empty for symbol-only input", () => {
    expect(slugify("!!!")).toBe("");
  });
  it("caps length", () => {
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(48);
  });
});

describe("isValidSlug", () => {
  it("rejects reserved, malformed and too-short slugs", () => {
    expect(isValidSlug("admin")).toBe(false);
    expect(isValidSlug("-bad")).toBe(false);
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("Upper")).toBe(false);
    expect(isValidSlug("good-slug-1")).toBe(true);
  });
});

describe("slugCandidate", () => {
  it("suffixes on collision", () => {
    expect(slugCandidate("acme", 1)).toBe("acme");
    expect(slugCandidate("acme", 3)).toBe("acme-3");
    expect(slugCandidate("", 1)).toBe("business");
  });
});
