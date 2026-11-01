import { beforeEach, describe, expect, it } from "vitest";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { authorizeMember } from "@/lib/auth/guard";
import { AuthError } from "@/lib/auth/errors";
import { listMemberships, pickActiveBusiness } from "@/services/business.service";
import { getOnboardingState, MAX_OWNED_BUSINESSES } from "@/services/onboarding.service";
import { POST as draftRoute } from "@/app/api/onboarding/draft/route";
import { POST as completeRoute } from "@/app/api/onboarding/complete/route";
import { POST as slugCheckRoute } from "@/app/api/onboarding/slug-check/route";
import { POST as logoRoute } from "@/app/api/onboarding/logo/route";
import {
  JPEG, PNG, WEBP, apiRequest, makeUser, multipartRequest, resetEmulators, validBusiness, type TestUser,
} from "./helpers";

const db = () => adminDb();
const complete = (u: TestUser, body: unknown) =>
  completeRoute(apiRequest("/api/onboarding/complete", body, { cookie: u.cookie }));
const saveDraft = (u: TestUser, body: unknown) =>
  draftRoute(apiRequest("/api/onboarding/draft", body, { cookie: u.cookie }));
const json = async (r: Response) => r.clone().json();

beforeEach(resetEmulators);

describe("authentication & verification gates", () => {
  it("anonymous callers get 401 on every onboarding endpoint (before any body parsing)", async () => {
    for (const [route, path] of [
      [draftRoute, "/api/onboarding/draft"],
      [completeRoute, "/api/onboarding/complete"],
      [slugCheckRoute, "/api/onboarding/slug-check"],
    ] as const) {
      const res = await route(apiRequest(path, { garbage: true }));
      expect(res.status, path).toBe(401);
    }
    expect((await logoRoute(multipartRequest("/api/onboarding/logo", { bytes: PNG, name: "a.png", type: "image/png" }))).status).toBe(401);
  });

  it("unverified users are refused with 403 and nothing is created", async () => {
    const u = await makeUser({ verified: false });
    for (const res of [
      await complete(u, validBusiness()),
      await saveDraft(u, { step: 1, data: {} }),
      await slugCheckRoute(apiRequest("/api/onboarding/slug-check", { slug: "x-y" }, { cookie: u.cookie })),
      await logoRoute(multipartRequest("/api/onboarding/logo", { bytes: PNG, name: "a.png", type: "image/png" }, u.cookie)),
    ]) {
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe("email_unverified");
    }
    expect((await db().collection("businesses").get()).size).toBe(0);
    expect((await db().collection("slugs").get()).size).toBe(0);
  });

  it("CSRF protection applies to onboarding endpoints", async () => {
    const u = await makeUser();
    const res = await completeRoute(apiRequest("/api/onboarding/complete", validBusiness(), { cookie: u.cookie, headers: { "x-requested-with": null } }));
    expect(res.status).toBe(403);
  });
});

describe("business creation (atomic initialisation)", () => {
  it("creates slug, business, OWNER membership, default settings, user pointer and completes the draft", async () => {
    const u = await makeUser();
    const res = await complete(u, validBusiness({ storeStatus: "published", defaultTheme: "dark" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, created: true, slug: "northstar-clothing" });
    const id = body.businessId as string;

    const slug = (await db().doc("slugs/northstar-clothing").get()).data()!;
    expect(slug).toMatchObject({ businessId: id, type: "primary" });

    const biz = (await db().doc(`businesses/${id}`).get()).data()!;
    expect(biz).toMatchObject({
      name: "Northstar Clothing", slug: "northstar-clothing", ownerId: u.uid, storeStatus: "published",
      industry: "Apparel & Fashion", deletedAt: null, customDomain: null, subdomain: null,
    });
    expect(biz.onboarding).toMatchObject({ status: "COMPLETED", version: 1 });
    expect(biz.createdAt).toBeDefined();

    const member = (await db().doc(`businesses/${id}/members/${u.uid}`).get()).data()!;
    expect(member).toMatchObject({ uid: u.uid, businessId: id, role: "OWNER", email: u.email });

    const store = (await db().doc(`businesses/${id}/settings/store`).get()).data()!;
    expect(store).toMatchObject({ displayName: "Northstar", status: "published", publicVisibility: true, currency: "INR" });
    const branding = (await db().doc(`businesses/${id}/settings/branding`).get()).data()!;
    expect(branding).toMatchObject({ primaryColor: "#111827", accentColor: "#2563EB", defaultTheme: "dark", logo: null });

    expect((await db().doc(`users/${u.uid}`).get()).get("lastBusinessId")).toBe(id);
    const state = await getOnboardingState(u.uid);
    expect(state.status).toBe("COMPLETED");
    expect(state.draft?.completedBusinessId).toBe(id);
  });

  it("repeated submission returns the same business and writes nothing twice", async () => {
    const u = await makeUser();
    const first = await json(await complete(u, validBusiness()));
    const second = await json(await complete(u, validBusiness()));
    const third = await json(await complete(u, validBusiness({ businessName: "Changed Name", slug: "changed-slug" })));
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, businessId: first.businessId });
    expect(third).toMatchObject({ created: false, businessId: first.businessId });
    expect((await db().collection("businesses").get()).size).toBe(1);
    expect((await db().collection("slugs").get()).size).toBe(1);
    expect((await db().collection(`businesses/${first.businessId}/members`).get()).size).toBe(1);
    expect((await db().doc(`businesses/${first.businessId}`).get()).get("name")).toBe("Northstar Clothing");
  });

  it("concurrent duplicate requests (double-click / retry storm) create exactly one business", async () => {
    const u = await makeUser();
    const results = await Promise.all(Array.from({ length: 6 }, () => complete(u, validBusiness())));
    const bodies = await Promise.all(results.map(json));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    expect(new Set(bodies.map((b) => b.businessId)).size).toBe(1);
    expect(bodies.filter((b) => b.created).length).toBe(1);
    expect((await db().collection("businesses").get()).size).toBe(1);
    expect((await db().collection(`businesses/${bodies[0].businessId}/members`).get()).size).toBe(1);
  });

  it("rolls back EVERYTHING when any write in the transaction fails, and the retry then succeeds", async () => {
    const u = await makeUser();
    await saveDraft(u, { step: 2, data: { businessName: "Northstar Clothing" } });
    const { draft } = await getOnboardingState(u.uid);
    const id = draft!.businessId;
    // Sabotage the LAST-ish create so earlier buffered writes must be discarded.
    await db().doc(`businesses/${id}/settings/branding`).set({ poison: true });

    const failed = await complete(u, validBusiness());
    expect(failed.status).toBe(500);
    expect((await json(failed)).code).toBe("internal");

    expect((await db().doc("slugs/northstar-clothing").get()).exists).toBe(false);
    expect((await db().doc(`businesses/${id}`).get()).exists).toBe(false);
    expect((await db().doc(`businesses/${id}/members/${u.uid}`).get()).exists).toBe(false);
    expect((await db().doc(`businesses/${id}/settings/store`).get()).exists).toBe(false);
    expect((await db().doc(`users/${u.uid}`).get()).get("lastBusinessId")).toBeNull();
    expect((await getOnboardingState(u.uid)).status).toBe("IN_PROGRESS");
    expect(await listMemberships(u.uid)).toEqual([]);

    await db().doc(`businesses/${id}/settings/branding`).delete();
    const retry = await complete(u, validBusiness());
    expect(retry.status).toBe(200);
    expect((await json(retry)).businessId).toBe(id);
    expect((await listMemberships(u.uid)).map((m) => m.role)).toEqual(["OWNER"]);
  });
});

describe("slug system", () => {
  it("a taken slug is refused with a field error, leaves the winner untouched, and the loser can retry", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const winner = await json(await complete(a, validBusiness()));

    const lost = await complete(b, validBusiness({ businessName: "Imposter" }));
    expect(lost.status).toBe(409);
    const lostBody = await json(lost);
    expect(lostBody.code).toBe("slug_taken");
    expect(lostBody.fieldErrors.slug).toBeDefined();

    expect((await db().doc("slugs/northstar-clothing").get()).get("businessId")).toBe(winner.businessId);
    expect(await listMemberships(b.uid)).toEqual([]);
    expect((await getOnboardingState(b.uid)).status).toBe("IN_PROGRESS");

    const retry = await complete(b, validBusiness({ businessName: "Imposter", slug: "northstar-two" }));
    expect(retry.status).toBe(200);
  });

  it("concurrent claims of one slug: exactly one winner, everyone else gets slug_taken, no partial tenants", async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    const results = await Promise.all(users.map((u) => complete(u, validBusiness())));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409, 409]);

    const winnerIdx = results.findIndex((r) => r.status === 200);
    const winnerBody = await json(results[winnerIdx]);
    expect((await db().doc("slugs/northstar-clothing").get()).get("businessId")).toBe(winnerBody.businessId);
    expect((await db().collection("businesses").get()).size).toBe(1);
    for (const [i, u] of users.entries()) {
      expect((await listMemberships(u.uid)).length).toBe(i === winnerIdx ? 1 : 0);
    }
  });

  it("auto-generates a slug from the store name and resolves collisions (acme, acme-2, acme-3)", async () => {
    const [a, b, c] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    const slugs: string[] = [];
    for (const u of [a, b, c]) {
      const r = await json(await complete(u, validBusiness({ slug: "", storeDisplayName: "Acme", businessName: "Acme Inc" })));
      slugs.push(r.slug);
    }
    expect(slugs).toEqual(["acme", "acme-2", "acme-3"]);
  });

  it("auto-generation skips reserved derived slugs", async () => {
    const u = await makeUser();
    const r = await json(await complete(u, validBusiness({ slug: "", storeDisplayName: "Admin", businessName: "Admin Co" })));
    expect(r.slug).toBe("admin-2");
  });

  it("concurrent AUTO slug requests for the same name all succeed with distinct slugs", async () => {
    const users = await Promise.all(Array.from({ length: 5 }, () => makeUser()));
    const results = await Promise.all(users.map((u) => complete(u, validBusiness({ slug: "", storeDisplayName: "Urban Thread", businessName: "Urban Thread" }))));
    expect(results.map((r) => r.status)).toEqual(Array(5).fill(200));
    const slugs = (await Promise.all(results.map(json))).map((b) => b.slug);
    expect(new Set(slugs).size).toBe(5);
    expect((await db().collection("slugs").get()).size).toBe(5);
  });

  it("slug-check reports available / reserved / invalid / taken (with a suggestion)", async () => {
    const a = await makeUser();
    await complete(a, validBusiness({ slug: "modern-living" }));
    const check = async (slug: string) => json(await slugCheckRoute(apiRequest("/api/onboarding/slug-check", { slug }, { cookie: a.cookie })));
    expect(await check("urban-thread")).toMatchObject({ ok: true, available: true });
    expect(await check("admin")).toMatchObject({ available: false, reason: "reserved" });
    expect(await check("Bad Slug!")).toMatchObject({ available: false, reason: "invalid" });
    expect(await check("modern-living")).toMatchObject({ available: false, reason: "taken", suggestion: "modern-living-2" });
  });
});

describe("validation", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["missing business name", { businessName: "" }, "businessName"],
    ["one-letter business name", { businessName: "A" }, "businessName"],
    ["HTML in name", { businessName: "<script>x</script>" }, "businessName"],
    ["unknown industry", { industry: "Weapons" }, "industry"],
    ["bad contact email", { contactEmail: "nope" }, "contactEmail"],
    ["bad phone", { contactPhone: "call me" }, "contactPhone"],
    ["bad color", { primaryColor: "red" }, "primaryColor"],
    ["3-digit hex color", { accentColor: "#fff" }, "accentColor"],
    ["bad theme", { defaultTheme: "neon" }, "defaultTheme"],
    ["bad status", { storeStatus: "live" }, "storeStatus"],
    ["reserved slug", { slug: "admin" }, "slug"],
    ["uppercase/special slug", { slug: "Bad Slug!" }, "slug"],
    ["leading hyphen slug", { slug: "-abc" }, "slug"],
    ["double hyphen slug", { slug: "a--b" }, "slug"],
    ["too-long description", { description: "x".repeat(501) }, "description"],
  ];
  it.each(cases)("rejects %s and creates nothing", async (_n, over, field) => {
    const u = await makeUser();
    const res = await complete(u, validBusiness(over));
    expect(res.status).toBe(400);
    expect((await json(res)).fieldErrors[field]).toBeDefined();
    expect((await db().collection("businesses").get()).size).toBe(0);
    expect((await db().collection("slugs").get()).size).toBe(0);
  });

  it("optional fields may be omitted entirely", async () => {
    const u = await makeUser();
    const res = await complete(u, { businessName: "Tiny Shop", industry: "Other", storeDisplayName: "Tiny Shop" });
    expect(res.status).toBe(200);
    const id = (await json(res)).businessId;
    expect((await db().doc(`businesses/${id}`).get()).data()).toMatchObject({ description: "", contactEmail: "", storeStatus: "unpublished", slug: "tiny-shop" });
    expect((await db().doc(`businesses/${id}/settings/branding`).get()).get("primaryColor")).toBe("#111827");
  });
});

describe("resume", () => {
  it("NOT_STARTED → IN_PROGRESS → COMPLETED; partial saves merge instead of overwriting", async () => {
    const u = await makeUser();
    expect((await getOnboardingState(u.uid)).status).toBe("NOT_STARTED");

    expect((await saveDraft(u, { step: 1, data: { businessName: "Resume Co", industry: "Other", description: "keep me" } })).status).toBe(200);
    expect((await saveDraft(u, { step: 3, data: { primaryColor: "#123456" } })).status).toBe(200);

    const state = await getOnboardingState(u.uid);
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.draft).toMatchObject({ step: 3, data: { businessName: "Resume Co", description: "keep me", primaryColor: "#123456" } });
    expect(Object.keys(state.draft!.data)).not.toContain("slug"); // no defaults injected

    const idBefore = state.draft!.businessId;
    await complete(u, validBusiness({ businessName: "Resume Co", slug: "resume-co" }));
    const done = await getOnboardingState(u.uid);
    expect(done.status).toBe("COMPLETED");
    expect(done.draft!.businessId).toBe(idBefore); // the reserved id is the business id
  });

  it("drafts reject invalid data and cannot be modified once COMPLETED", async () => {
    const u = await makeUser();
    expect((await saveDraft(u, { step: 2, data: { primaryColor: "blue" } })).status).toBe(400);
    expect((await saveDraft(u, { step: 9, data: {} })).status).toBe(400);
    await complete(u, validBusiness());
    expect((await saveDraft(u, { step: 1, data: { businessName: "Tamper" } })).status).toBe(403);
  });

  it("each user's draft is private: another user cannot read, resume or complete it", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await saveDraft(a, { step: 1, data: { businessName: "Secret Plans" } });
    const bState = await getOnboardingState(b.uid);
    expect(bState.status).toBe("NOT_STARTED");
    await saveDraft(b, { step: 1, data: { industry: "Other" } });
    const bDraft = (await getOnboardingState(b.uid)).draft!;
    expect(bDraft.data).not.toHaveProperty("businessName");
    expect(bDraft.businessId).not.toBe((await getOnboardingState(a.uid)).draft!.businessId);
  });
});

describe("multiple businesses per user", () => {
  it("a user can create a second business via a fresh draft; roles are independent per business", async () => {
    const u = await makeUser();
    const first = await json(await complete(u, validBusiness()));

    expect((await saveDraft(u, { step: 1, data: {} })).status).toBe(403); // completed draft is not reusable
    expect((await saveDraft(u, { step: 1, data: { businessName: "Second Brand" }, fresh: true })).status).toBe(200);
    const second = await json(await complete(u, validBusiness({ businessName: "Second Brand", slug: "second-brand", storeDisplayName: "Second" })));
    expect(second.businessId).not.toBe(first.businessId);

    const memberships = await listMemberships(u.uid);
    expect(memberships.map((m) => m.business.name)).toEqual(["Northstar Clothing", "Second Brand"]);
    expect(memberships.every((m) => m.role === "OWNER")).toBe(true);
    expect((await db().doc(`users/${u.uid}`).get()).get("lastBusinessId")).toBe(second.businessId);
  });

  it("caps owned businesses per account", async () => {
    const u = await makeUser();
    for (let i = 0; i < MAX_OWNED_BUSINESSES; i++) {
      await saveDraft(u, { step: 1, data: {}, fresh: true });
      expect((await complete(u, validBusiness({ slug: `shop-number-${i}` }))).status).toBe(200);
    }
    await saveDraft(u, { step: 1, data: {}, fresh: true });
    const over = await complete(u, validBusiness({ slug: "one-too-many" }));
    expect(over.status).toBe(403);
    expect((await json(over)).code).toBe("limit_reached");
    expect((await db().doc("slugs/one-too-many").get()).exists).toBe(false);
  });

  it("memberships carry per-business roles; active-business selection never trusts a requested id", async () => {
    const owner = await makeUser();
    const staff = await makeUser();
    const ownerBiz = (await json(await complete(owner, validBusiness()))).businessId as string;
    const staffBiz = (await json(await complete(staff, validBusiness({ slug: "staff-shop", businessName: "Staff Shop" })))).businessId as string;
    // staff is additionally an EDITOR in the owner's business (as a future invitation would create)
    await db().doc(`businesses/${ownerBiz}/members/${staff.uid}`).set({ uid: staff.uid, businessId: ownerBiz, role: "EDITOR" });

    const ms = await listMemberships(staff.uid);
    expect(Object.fromEntries(ms.map((m) => [m.businessId, m.role]))).toEqual({ [ownerBiz]: "EDITOR", [staffBiz]: "OWNER" });

    // honoured only when it matches a membership
    expect(pickActiveBusiness(ms, ownerBiz, staffBiz)).toMatchObject({ active: { businessId: ownerBiz, role: "EDITOR" }, requestedDenied: false });
    // a business the caller is NOT in is ignored without confirming it exists
    const stranger = await listMemberships(owner.uid);
    const denied = pickActiveBusiness(stranger, staffBiz, ownerBiz)!;
    expect(denied).toMatchObject({ active: { businessId: ownerBiz }, requestedDenied: true });
    expect(pickActiveBusiness([], "x", null)).toBeNull();
    // soft-deleted businesses disappear from memberships
    await db().doc(`businesses/${staffBiz}`).update({ deletedAt: "2026-01-01" });
    expect((await listMemberships(staff.uid)).map((m) => m.businessId)).toEqual([ownerBiz]);
  });
});

describe("privilege escalation & tenant isolation", () => {
  it("cannot smuggle role/ownerId/businessId/uid through the request body", async () => {
    const victim = await makeUser();
    const attacker = await makeUser();
    const victimBiz = (await json(await complete(victim, validBusiness()))).businessId as string;

    const res = await complete(attacker, {
      ...validBusiness({ slug: "attacker-shop", businessName: "Attacker Shop" }),
      role: "OWNER", ownerId: victim.uid, uid: victim.uid, businessId: victimBiz, completedBusinessId: victimBiz,
      status: "COMPLETED", members: { [attacker.uid]: "OWNER" },
    });
    expect(res.status).toBe(200);
    const mine = (await json(res)).businessId as string;
    expect(mine).not.toBe(victimBiz);

    // attacker owns only their own business; victim's tenant is untouched
    expect((await db().doc(`businesses/${mine}`).get()).get("ownerId")).toBe(attacker.uid);
    expect((await db().collection(`businesses/${victimBiz}/members`).get()).docs.map((d) => d.id)).toEqual([victim.uid]);
    expect((await db().doc(`businesses/${victimBiz}`).get()).get("ownerId")).toBe(victim.uid);
    await expect(authorizeMember(db(), attacker.uid, victimBiz, "business:view")).rejects.toMatchObject({ code: "forbidden" });
    await expect(authorizeMember(db(), attacker.uid, victimBiz, "product:write")).rejects.toBeInstanceOf(AuthError);
  });

  it("cannot take over another business's slug, nor add/overwrite memberships, via any onboarding call", async () => {
    const victim = await makeUser();
    const attacker = await makeUser();
    const victimBiz = (await json(await complete(victim, validBusiness()))).businessId as string;

    const res = await complete(attacker, validBusiness({ businessName: "Attacker" }));
    expect(res.status).toBe(409);
    expect((await db().doc("slugs/northstar-clothing").get()).get("businessId")).toBe(victimBiz);
    expect((await db().doc(`businesses/${victimBiz}`).get()).get("name")).toBe("Northstar Clothing");
    expect((await db().collection(`businesses/${victimBiz}/members`).get()).size).toBe(1);
  });

  it("an EDITOR of a business cannot use owner-only operations there (role matrix preserved)", async () => {
    const owner = await makeUser();
    const editor = await makeUser();
    const biz = (await json(await complete(owner, validBusiness()))).businessId as string;
    await db().doc(`businesses/${biz}/members/${editor.uid}`).set({ uid: editor.uid, businessId: biz, role: "EDITOR" });
    for (const p of ["business:delete", "team:manage", "settings:update", "product:delete"] as const) {
      await expect(authorizeMember(db(), editor.uid, biz, p), p).rejects.toMatchObject({ code: "forbidden" });
    }
    await expect(authorizeMember(db(), editor.uid, biz, "product:write")).resolves.toBe("EDITOR");
    // completing onboarding as the editor creates their OWN workspace, never touches the owner's
    await complete(editor, validBusiness({ slug: "editor-own", businessName: "Editor Own" }));
    expect((await db().doc(`businesses/${biz}/members/${owner.uid}`).get()).get("role")).toBe("OWNER");
    expect((await db().doc(`businesses/${biz}/members/${editor.uid}`).get()).get("role")).toBe("EDITOR");
  });
});

describe("logo upload", () => {
  const upload = (u: TestUser, bytes: Uint8Array, name = "logo.png", type = "image/png") =>
    logoRoute(multipartRequest("/api/onboarding/logo", { bytes, name, type }, u.cookie));

  it("stores a valid image under the reserved business folder and attaches it atomically at creation", async () => {
    const u = await makeUser();
    const res = await upload(u, PNG);
    expect(res.status).toBe(200);
    const { draft } = await getOnboardingState(u.uid);
    const logo = draft!.logo!;
    expect(logo.storagePath.startsWith(`businesses/${draft!.businessId}/media/`)).toBe(true);
    expect(logo.contentType).toBe("image/png");
    const [exists] = await adminBucket().file(logo.storagePath).exists();
    expect(exists).toBe(true);

    const id = (await json(await complete(u, validBusiness()))).businessId as string;
    const media = (await db().doc(`businesses/${id}/media/${logo.mediaId}`).get()).data()!;
    expect(media).toMatchObject({ businessId: id, storagePath: logo.storagePath, uploadedBy: u.uid, contentType: "image/png" });
    expect((await db().doc(`businesses/${id}/settings/branding`).get()).get("logo")).toMatchObject({ mediaId: logo.mediaId, storagePath: logo.storagePath });
  });

  it("accepts JPEG and WebP, detecting the type from content (not the declared type)", async () => {
    const u = await makeUser();
    expect((await upload(u, JPEG, "a.png", "image/png")).status).toBe(200);
    expect((await getOnboardingState(u.uid)).draft!.logo!.contentType).toBe("image/jpeg");
    expect((await upload(u, WEBP, "b.jpg", "image/jpeg")).status).toBe(200);
    expect((await getOnboardingState(u.uid)).draft!.logo!.contentType).toBe("image/webp");
  });

  it("rejects non-images, disguised files, SVG, empty and oversized uploads", async () => {
    const u = await makeUser();
    const enc = (s: string) => new TextEncoder().encode(s);
    const cases: [string, Uint8Array, string, string][] = [
      ["text disguised as png", enc("hello, definitely not an image"), "x.png", "image/png"],
      ["svg", enc("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "x.svg", "image/svg+xml"],
      ["html", enc("<html><script>1</script></html>"), "x.png", "image/png"],
      ["gif", enc("GIF89a....."), "x.gif", "image/gif"],
      ["pdf", enc("%PDF-1.7 ..."), "x.pdf", "application/pdf"],
      ["empty", new Uint8Array(0), "x.png", "image/png"],
      ["too large", new Uint8Array(2 * 1024 * 1024 + 1).fill(1).map((_, i) => (i < 8 ? PNG[i] : 1)), "big.png", "image/png"],
    ];
    for (const [name, bytes, file, type] of cases) {
      const res = await upload(u, bytes, file, type);
      expect(res.status, name).toBe(400);
    }
    expect((await getOnboardingState(u.uid)).draft?.logo ?? null).toBeNull();
  });

  it("replacing or removing the logo deletes the previous object", async () => {
    const u = await makeUser();
    await upload(u, PNG);
    const first = (await getOnboardingState(u.uid)).draft!.logo!;
    await upload(u, JPEG);
    const second = (await getOnboardingState(u.uid)).draft!.logo!;
    expect(second.storagePath).not.toBe(first.storagePath);
    expect((await adminBucket().file(first.storagePath).exists())[0]).toBe(false);

    expect((await saveDraft(u, { step: 2, data: {}, removeLogo: true })).status).toBe(200);
    expect((await getOnboardingState(u.uid)).draft!.logo).toBeNull();
    expect((await adminBucket().file(second.storagePath).exists())[0]).toBe(false);
  });

  it("a logo whose object has vanished does not block business creation", async () => {
    const u = await makeUser();
    await upload(u, PNG);
    const logo = (await getOnboardingState(u.uid)).draft!.logo!;
    await adminBucket().file(logo.storagePath).delete();
    const res = await complete(u, validBusiness());
    expect(res.status).toBe(200);
    const id = (await json(res)).businessId;
    expect((await db().doc(`businesses/${id}/settings/branding`).get()).get("logo")).toBeNull();
  });
});
