import "firebase/compat/firestore";
import "firebase/compat/storage";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

export const PROJECT_ID = "demo-brand-portal";
export const BIZ_A = "biz-a"; // unpublished store
export const BIZ_B = "biz-b"; // published store

export const USERS = {
  ownerA: "owner-a",
  adminA: "admin-a",
  managerA: "manager-a",
  editorA: "editor-a",
  ownerB: "owner-b",
  outsider: "outsider",
} as const;

export async function createEnv(): Promise<RulesTestEnvironment> {
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  const [stHost, stPort] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199").split(":");
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: fsHost,
      port: Number(fsPort),
    },
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
      host: stHost,
      port: Number(stPort),
    },
  });
}

/** Seeds two tenants with every role, bypassing rules. */
export async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (path: string, data: Record<string, unknown>) => setDoc(doc(db, path), data);

    await put(`businesses/${BIZ_A}`, { name: "A", storeStatus: "unpublished", ownerId: USERS.ownerA });
    await put(`businesses/${BIZ_B}`, { name: "B", storeStatus: "published", ownerId: USERS.ownerB });

    const members: [string, string, string][] = [
      [BIZ_A, USERS.ownerA, "OWNER"],
      [BIZ_A, USERS.adminA, "ADMIN"],
      [BIZ_A, USERS.managerA, "MANAGER"],
      [BIZ_A, USERS.editorA, "EDITOR"],
      [BIZ_B, USERS.ownerB, "OWNER"],
    ];
    for (const [b, uid, role] of members) {
      await put(`businesses/${b}/members/${uid}`, { uid, role, businessId: b });
    }

    for (const b of [BIZ_A, BIZ_B]) {
      await put(`businesses/${b}/products/active1`, { name: "Active", status: "active", businessId: b });
      await put(`businesses/${b}/products/draft1`, { name: "Draft", status: "draft", businessId: b });
      await put(`businesses/${b}/categories/catActive`, { name: "On", active: true, businessId: b });
      await put(`businesses/${b}/categories/catHidden`, { name: "Off", active: false, businessId: b });
      await put(`businesses/${b}/settings/branding`, { displayName: b });
      await put(`businesses/${b}/settings/store`, { displayName: b });
      await put(`businesses/${b}/settings/secretish`, { x: 1 });
      await put(`businesses/${b}/media/m1`, { storagePath: "x" });
      await put(`businesses/${b}/invitations/i1`, { email: "x@example.com", status: "pending" });
    }

    await put(`users/${USERS.ownerA}`, { email: "owner-a@example.com" });
    await put(`users/${USERS.ownerB}`, { email: "owner-b@example.com" });
    await put(`slugs/brand-b`, { businessId: BIZ_B });
    await put(`users/${USERS.ownerA}/onboarding/current`, {
      status: "IN_PROGRESS", businessId: "reserved-id", data: { businessName: "Draft" },
    });
  });
}
