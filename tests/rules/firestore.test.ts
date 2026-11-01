import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from "firebase/firestore";
import { BIZ_A, BIZ_B, USERS, createEnv, seed } from "./helpers";

let env: RulesTestEnvironment;
const dbAs = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed(env);
});

describe("unauthenticated access", () => {
  it("cannot read private tenant data", async () => {
    const db = anon();
    await assertFails(getDoc(doc(db, `businesses/${BIZ_A}`)));
    await assertFails(getDoc(doc(db, `businesses/${BIZ_B}`)));
    await assertFails(getDoc(doc(db, `businesses/${BIZ_A}/products/draft1`)));
    await assertFails(getDoc(doc(db, `businesses/${BIZ_A}/members/${USERS.ownerA}`)));
    await assertFails(getDoc(doc(db, `users/${USERS.ownerA}`)));
    await assertFails(getDocs(collection(db, `businesses/${BIZ_A}/products`)));
  });

  it("cannot write anything", async () => {
    const db = anon();
    await assertFails(setDoc(doc(db, `businesses/${BIZ_A}/products/new`), { name: "x" }));
    await assertFails(setDoc(doc(db, `businesses/new`), { name: "x" }));
    await assertFails(setDoc(doc(db, `users/someone`), { email: "x" }));
  });
});

describe("tenant membership", () => {
  it("members can read their own business tree", async () => {
    const db = dbAs(USERS.ownerA);
    await assertSucceeds(getDoc(doc(db, `businesses/${BIZ_A}`)));
    await assertSucceeds(getDoc(doc(db, `businesses/${BIZ_A}/products/draft1`)));
    await assertSucceeds(getDocs(collection(db, `businesses/${BIZ_A}/products`)));
    await assertSucceeds(getDocs(collection(db, `businesses/${BIZ_A}/categories`)));
    await assertSucceeds(getDocs(collection(db, `businesses/${BIZ_A}/members`)));
    await assertSucceeds(getDoc(doc(db, `businesses/${BIZ_A}/settings/branding`)));
    await assertSucceeds(getDocs(collection(db, `businesses/${BIZ_A}/media`)));
  });

  it("every role can read the business", async () => {
    for (const uid of [USERS.adminA, USERS.managerA, USERS.editorA]) {
      await assertSucceeds(getDoc(doc(dbAs(uid), `businesses/${BIZ_A}/products/draft1`)));
    }
  });

  it("owner of A cannot read private data of B", async () => {
    const db = dbAs(USERS.ownerA);
    await assertFails(getDoc(doc(db, `businesses/${BIZ_B}`)));
    await assertFails(getDoc(doc(db, `businesses/${BIZ_B}/products/draft1`)));
    await assertFails(getDoc(doc(db, `businesses/${BIZ_B}/categories/catHidden`)));
    await assertFails(getDocs(collection(db, `businesses/${BIZ_B}/members`)));
    await assertFails(getDocs(collection(db, `businesses/${BIZ_B}/media`)));
    await assertFails(getDocs(collection(db, `businesses/${BIZ_B}/invitations`)));
    await assertFails(getDoc(doc(db, `businesses/${BIZ_B}/settings/secretish`)));
  });

  it("owner of B cannot read A (unpublished) at all", async () => {
    const db = dbAs(USERS.ownerB);
    await assertFails(getDoc(doc(db, `businesses/${BIZ_A}/products/active1`)));
    await assertFails(getDoc(doc(db, `businesses/${BIZ_A}/settings/branding`)));
  });

  it("users with no membership see nothing", async () => {
    const db = dbAs(USERS.outsider);
    await assertFails(getDoc(doc(db, `businesses/${BIZ_A}`)));
    await assertFails(getDocs(collection(db, `businesses/${BIZ_A}/products`)));
  });

  it("removing the member document revokes access immediately", async () => {
    await assertSucceeds(getDoc(doc(dbAs(USERS.editorA), `businesses/${BIZ_A}/products/active1`)));
    await env.withSecurityRulesDisabled((ctx) =>
      deleteDoc(doc(ctx.firestore(), `businesses/${BIZ_A}/members/${USERS.editorA}`)),
    );
    await assertFails(getDoc(doc(dbAs(USERS.editorA), `businesses/${BIZ_A}/products/active1`)));
  });

  it("only OWNER/ADMIN can read invitations", async () => {
    const path = `businesses/${BIZ_A}/invitations/i1`;
    await assertSucceeds(getDoc(doc(dbAs(USERS.ownerA), path)));
    await assertSucceeds(getDoc(doc(dbAs(USERS.adminA), path)));
    await assertFails(getDoc(doc(dbAs(USERS.managerA), path)));
    await assertFails(getDoc(doc(dbAs(USERS.editorA), path)));
  });

  it("users can read only their own profile", async () => {
    await assertSucceeds(getDoc(doc(dbAs(USERS.ownerA), `users/${USERS.ownerA}`)));
    await assertFails(getDoc(doc(dbAs(USERS.ownerA), `users/${USERS.ownerB}`)));
  });
});

describe("client writes are denied for every role (server-only mutations)", () => {
  const roles = Object.entries(USERS);

  it.each(roles)("%s cannot create/update/delete products in A or B", async (_n, uid) => {
    const db = dbAs(uid);
    for (const b of [BIZ_A, BIZ_B]) {
      await assertFails(addDoc(collection(db, `businesses/${b}/products`), { name: "x", status: "active" }));
      await assertFails(updateDoc(doc(db, `businesses/${b}/products/active1`), { name: "hacked" }));
      await assertFails(deleteDoc(doc(db, `businesses/${b}/products/active1`)));
    }
  });

  it.each(roles)("%s cannot write categories, members, settings, business, slugs", async (_n, uid) => {
    const db = dbAs(uid);
    await assertFails(setDoc(doc(db, `businesses/${BIZ_A}/categories/c`), { name: "x" }));
    await assertFails(updateDoc(doc(db, `businesses/${BIZ_A}/categories/catActive`), { name: "x" }));
    await assertFails(deleteDoc(doc(db, `businesses/${BIZ_A}/categories/catActive`)));
    await assertFails(updateDoc(doc(db, `businesses/${BIZ_A}/members/${USERS.editorA}`), { role: "OWNER" }));
    await assertFails(setDoc(doc(db, `businesses/${BIZ_A}/members/${uid}`), { uid, role: "OWNER" }));
    await assertFails(updateDoc(doc(db, `businesses/${BIZ_A}/settings/branding`), { displayName: "x" }));
    await assertFails(updateDoc(doc(db, `businesses/${BIZ_A}`), { ownerId: uid }));
    await assertFails(setDoc(doc(db, `slugs/stolen`), { businessId: BIZ_A }));
    await assertFails(setDoc(doc(db, `users/${uid}`), { email: "x" }));
  });

  it("self-promotion through the member document is impossible", async () => {
    await assertFails(
      updateDoc(doc(dbAs(USERS.editorA), `businesses/${BIZ_A}/members/${USERS.editorA}`), { role: "OWNER" }),
    );
  });
});

describe("public storefront read surface (System 2)", () => {
  it("anyone can read ACTIVE products of a PUBLISHED business", async () => {
    await assertSucceeds(getDoc(doc(anon(), `businesses/${BIZ_B}/products/active1`)));
    await assertSucceeds(
      getDocs(query(collection(anon(), `businesses/${BIZ_B}/products`), where("status", "==", "active"))),
    );
  });

  it("drafts of a published business stay private", async () => {
    await assertFails(getDoc(doc(anon(), `businesses/${BIZ_B}/products/draft1`)));
    await assertFails(getDocs(collection(anon(), `businesses/${BIZ_B}/products`)));
  });

  it("active products of an UNPUBLISHED business stay private", async () => {
    await assertFails(getDoc(doc(anon(), `businesses/${BIZ_A}/products/active1`)));
  });

  it("only active categories and branding/store settings are public", async () => {
    await assertSucceeds(getDoc(doc(anon(), `businesses/${BIZ_B}/categories/catActive`)));
    await assertFails(getDoc(doc(anon(), `businesses/${BIZ_B}/categories/catHidden`)));
    await assertSucceeds(getDoc(doc(anon(), `businesses/${BIZ_B}/settings/branding`)));
    await assertSucceeds(getDoc(doc(anon(), `businesses/${BIZ_B}/settings/store`)));
    await assertFails(getDoc(doc(anon(), `businesses/${BIZ_B}/settings/secretish`)));
  });

  it("business doc, members, media and invitations are never public", async () => {
    await assertFails(getDoc(doc(anon(), `businesses/${BIZ_B}`)));
    await assertFails(getDocs(collection(anon(), `businesses/${BIZ_B}/members`)));
    await assertFails(getDocs(collection(anon(), `businesses/${BIZ_B}/media`)));
    await assertFails(getDocs(collection(anon(), `businesses/${BIZ_B}/invitations`)));
  });

  it("slug lookup is public but read-only", async () => {
    await assertSucceeds(getDoc(doc(anon(), `slugs/brand-b`)));
    await assertFails(setDoc(doc(dbAs(USERS.ownerB), `slugs/brand-b`), { businessId: BIZ_A }));
  });
});

describe("server-only collections", () => {
  it("rateLimits and unknown collections are inaccessible to clients", async () => {
    const db = dbAs(USERS.ownerA);
    await assertFails(getDoc(doc(db, `rateLimits/x`)));
    await assertFails(setDoc(doc(db, `rateLimits/x`), { count: 0 }));
    await assertFails(getDoc(doc(db, `anything/else`)));
  });
});

describe("Phase 3: onboarding drafts and tenant creation are server-only", () => {
  it("the onboarding draft is unreadable and unwritable by everyone, including its owner", async () => {
    const path = `users/${USERS.ownerA}/onboarding/current`;
    for (const db of [dbAs(USERS.ownerA), dbAs(USERS.ownerB), anon()]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { status: "COMPLETED", businessId: "x" }));
      await assertFails(updateDoc(doc(db, path), { status: "COMPLETED" }));
    }
  });

  it("clients cannot fabricate a tenant: business, owner membership, defaults, media or slug", async () => {
    const db = dbAs(USERS.outsider);
    await assertFails(setDoc(doc(db, "businesses/mine"), { ownerId: USERS.outsider, storeStatus: "published" }));
    await assertFails(setDoc(doc(db, `businesses/mine/members/${USERS.outsider}`), { uid: USERS.outsider, role: "OWNER" }));
    await assertFails(setDoc(doc(db, "businesses/mine/settings/store"), { displayName: "x" }));
    await assertFails(setDoc(doc(db, "businesses/mine/settings/branding"), { displayName: "x" }));
    await assertFails(setDoc(doc(db, "businesses/mine/media/m"), { storagePath: "x" }));
    await assertFails(setDoc(doc(db, "slugs/mine"), { businessId: "mine" }));
  });

  it("an existing slug can be neither overwritten nor deleted by anyone, even that owner", async () => {
    for (const db of [dbAs(USERS.ownerB), dbAs(USERS.ownerA), anon()]) {
      await assertFails(setDoc(doc(db, "slugs/brand-b"), { businessId: BIZ_A }));
      await assertFails(updateDoc(doc(db, "slugs/brand-b"), { businessId: BIZ_A }));
      await assertFails(deleteDoc(doc(db, "slugs/brand-b")));
    }
  });

  it("a member of one business cannot add anyone to another business by writing members", async () => {
    const db = dbAs(USERS.ownerA);
    await assertFails(setDoc(doc(db, `businesses/${BIZ_B}/members/${USERS.ownerA}`), { uid: USERS.ownerA, role: "OWNER" }));
    await assertFails(setDoc(doc(db, `businesses/${BIZ_B}/members/${USERS.ownerB}`), { uid: USERS.ownerB, role: "EDITOR" }));
  });
});

describe("Catalogue milestone: reservations and storefront surface", () => {
  it("slug reservation documents are unreadable and unwritable by every client, members included", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `businesses/${BIZ_B}/slugReservations/product__tee`), { refId: "active1" });
    });
    for (const db of [anon(), dbAs(USERS.ownerB), dbAs(USERS.ownerA), dbAs(USERS.editorA)]) {
      await assertFails(getDoc(doc(db, `businesses/${BIZ_B}/slugReservations/product__tee`)));
      await assertFails(setDoc(doc(db, `businesses/${BIZ_B}/slugReservations/product__tee`), { refId: "x" }));
      await assertFails(deleteDoc(doc(db, `businesses/${BIZ_B}/slugReservations/product__tee`)));
    }
  });

  it("members of one tenant cannot write or change catalogue counters in another (or their own) tenant", async () => {
    for (const role of [USERS.ownerA, USERS.adminA, USERS.managerA, USERS.editorA]) {
      const db = dbAs(role);
      await assertFails(updateDoc(doc(db, `businesses/${BIZ_A}/categories/catActive`), { productCount: 99 }));
      await assertFails(updateDoc(doc(db, `businesses/${BIZ_B}/categories/catActive`), { active: false }));
      await assertFails(setDoc(doc(db, `businesses/${BIZ_B}/products/stolen`), { name: "x", status: "active" }));
    }
  });

  it("a status-filtered public product query works for a published store but cannot reach drafts or inactive categories", async () => {
    const db = anon();
    await assertSucceeds(getDocs(query(collection(db, `businesses/${BIZ_B}/products`), where("status", "==", "active"))));
    await assertFails(getDocs(query(collection(db, `businesses/${BIZ_B}/products`), where("status", "==", "draft"))));
    await assertFails(getDocs(query(collection(db, `businesses/${BIZ_B}/categories`), where("active", "==", false))));
    await assertSucceeds(getDocs(query(collection(db, `businesses/${BIZ_B}/categories`), where("active", "==", true))));
    await assertFails(getDocs(query(collection(db, `businesses/${BIZ_A}/products`), where("status", "==", "active"))));
  });
});
