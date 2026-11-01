import { beforeEach, describe, expect, it } from "vitest";
import { adminDb } from "@/lib/firebase/admin";
import { authorizeMember } from "@/lib/auth/guard";
import { AuthError } from "@/lib/auth/errors";
import { resetEmulators } from "./helpers";

const db = () => adminDb();

async function seed() {
  const d = db();
  await d.doc("businesses/biz-a").set({ name: "A", deletedAt: null });
  await d.doc("businesses/biz-b").set({ name: "B", deletedAt: null });
  await d.doc("businesses/biz-gone").set({ name: "Gone", deletedAt: "2026-01-01" });
  const m = (b: string, uid: string, role: string) => d.doc(`businesses/${b}/members/${uid}`).set({ uid, role });
  await m("biz-a", "owner-a", "OWNER");
  await m("biz-a", "admin-a", "ADMIN");
  await m("biz-a", "manager-a", "MANAGER");
  await m("biz-a", "editor-a", "EDITOR");
  await m("biz-b", "owner-b", "OWNER");
  await m("biz-gone", "owner-a", "OWNER");
  await m("biz-a", "corrupt", "SUPERUSER"); // role value outside the enum
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AuthError ? e.code : "unexpected";
  }
};

beforeEach(async () => {
  await resetEmulators();
  await seed();
});

describe("authorizeMember (tenant isolation + RBAC)", () => {
  it("user A can manage their own business products", async () => {
    expect(await authorizeMember(db(), "owner-a", "biz-a", "product:write")).toBe("OWNER");
  });

  it("user A cannot access business B in any way", async () => {
    for (const perm of ["business:view", "product:write", "product:delete", "category:write", "team:manage"] as const) {
      expect(await code(authorizeMember(db(), "owner-a", "biz-b", perm)), perm).toBe("forbidden");
    }
  });

  it("business B owner cannot modify business A products", async () => {
    expect(await code(authorizeMember(db(), "owner-b", "biz-a", "product:write"))).toBe("forbidden");
  });

  it("editor cannot perform owner-only / destructive operations", async () => {
    for (const perm of ["business:delete", "settings:update", "team:manage", "team:invite", "product:delete", "category:write"] as const) {
      expect(await code(authorizeMember(db(), "editor-a", "biz-a", perm)), perm).toBe("forbidden");
    }
    expect(await authorizeMember(db(), "editor-a", "biz-a", "product:write")).toBe("EDITOR");
  });

  it("admin cannot delete the business; owner can", async () => {
    expect(await code(authorizeMember(db(), "admin-a", "biz-a", "business:delete"))).toBe("forbidden");
    expect(await authorizeMember(db(), "owner-a", "biz-a", "business:delete")).toBe("OWNER");
  });

  it("manager can publish products but not manage the team", async () => {
    expect(await authorizeMember(db(), "manager-a", "biz-a", "product:publish")).toBe("MANAGER");
    expect(await code(authorizeMember(db(), "manager-a", "biz-a", "team:manage"))).toBe("forbidden");
  });

  it("non-members, unknown businesses and soft-deleted businesses are indistinguishable (forbidden)", async () => {
    expect(await code(authorizeMember(db(), "stranger", "biz-a", "business:view"))).toBe("forbidden");
    expect(await code(authorizeMember(db(), "owner-a", "does-not-exist", "business:view"))).toBe("forbidden");
    expect(await code(authorizeMember(db(), "owner-a", "biz-gone", "business:view"))).toBe("forbidden");
  });

  it("malformed / injection-style business ids are refused before any lookup", async () => {
    for (const id of ["", "../biz-a", "biz-a/members/x", "biz a", "biz-a\n", "a".repeat(200)]) {
      expect(await code(authorizeMember(db(), "owner-a", id, "business:view")), JSON.stringify(id)).toBe("forbidden");
    }
  });

  it("a corrupted role value grants nothing", async () => {
    expect(await code(authorizeMember(db(), "corrupt", "biz-a", "business:view"))).toBe("forbidden");
  });

  it("removing a membership revokes access immediately", async () => {
    expect(await authorizeMember(db(), "editor-a", "biz-a", "product:write")).toBe("EDITOR");
    await db().doc("businesses/biz-a/members/editor-a").delete();
    expect(await code(authorizeMember(db(), "editor-a", "biz-a", "product:write"))).toBe("forbidden");
  });
});
