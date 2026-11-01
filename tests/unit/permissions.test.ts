import { describe, expect, it } from "vitest";
import { can, canAssignRole, canManageMember } from "@/lib/permissions";

describe("permission matrix", () => {
  it("owner can do everything including deleting the business", () => {
    expect(can("OWNER", "business:delete")).toBe(true);
    expect(can("OWNER", "team:manage")).toBe(true);
  });

  it("admin cannot delete the business", () => {
    expect(can("ADMIN", "business:delete")).toBe(false);
    expect(can("ADMIN", "team:manage")).toBe(true);
  });

  it("editor cannot perform owner-only or destructive operations", () => {
    for (const p of [
      "business:delete", "business:update", "settings:update", "team:invite",
      "team:manage", "product:delete", "product:publish", "category:write",
      "branding:update", "media:delete",
    ] as const) {
      expect(can("EDITOR", p), p).toBe(false);
    }
    expect(can("EDITOR", "product:write")).toBe(true);
  });

  it("manager manages catalog but not team or business settings", () => {
    expect(can("MANAGER", "product:publish")).toBe(true);
    expect(can("MANAGER", "team:manage")).toBe(false);
    expect(can("MANAGER", "settings:update")).toBe(false);
  });
});

describe("role escalation", () => {
  it("nobody can assign OWNER", () => {
    expect(canAssignRole("OWNER", "OWNER")).toBe(false);
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
  });

  it("admin cannot grant admin (peer) but can grant manager/editor", () => {
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "MANAGER")).toBe(true);
    expect(canAssignRole("ADMIN", "EDITOR")).toBe(true);
  });

  it("owner may assign admin", () => {
    expect(canAssignRole("OWNER", "ADMIN")).toBe(true);
  });

  it("manager/editor cannot assign anything", () => {
    expect(canAssignRole("MANAGER", "EDITOR")).toBe(false);
    expect(canAssignRole("EDITOR", "EDITOR")).toBe(false);
  });

  it("admin cannot modify the owner or another admin", () => {
    expect(canManageMember("ADMIN", "OWNER")).toBe(false);
    expect(canManageMember("ADMIN", "ADMIN")).toBe(false);
    expect(canManageMember("ADMIN", "EDITOR")).toBe(true);
  });
});
