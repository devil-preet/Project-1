import { describe, expect, it } from "vitest";
import { loginSchema, passwordSchema, registerSchema } from "@/lib/validations/auth";

describe("passwordSchema", () => {
  it.each([
    ["short", "Ab1"],
    ["no upper", "alllowercase123"],
    ["no lower", "ALLUPPERCASE123"],
    ["no digit", "NoDigitsHereAtAll"],
    ["too long", "Aa1" + "x".repeat(130)],
  ])("rejects %s", (_n, pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
  it("accepts a strong password", () => {
    expect(passwordSchema.safeParse("Str0ngPassw0rdX").success).toBe(true);
  });
});

describe("registerSchema", () => {
  const base = { fullName: "Ada Lovelace", email: "Ada@Example.com ", password: "Str0ngPassw0rdX", confirmPassword: "Str0ngPassw0rdX" };
  it("normalizes email", () => {
    expect(registerSchema.parse(base).email).toBe("ada@example.com");
  });
  it("rejects HTML in names and mismatched passwords", () => {
    expect(registerSchema.safeParse({ ...base, fullName: "<script>" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, confirmPassword: "different" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("does not apply the strength policy to existing passwords", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "old" }).success).toBe(true);
  });
  it("defaults remember to false", () => {
    expect(loginSchema.parse({ email: "a@b.co", password: "x" }).remember).toBe(false);
  });
});
