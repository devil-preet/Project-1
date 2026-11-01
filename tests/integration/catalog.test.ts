import { beforeEach, describe, expect, it } from "vitest";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { listCategories } from "@/services/category.service";
import { listProducts } from "@/services/product.service";
import { JPEG, PNG, WEBP, resetEmulators } from "./helpers";
import { cat, getAdminMedia, pngId, prod, seedBusiness, settings, upload, validProduct, type Json, type World } from "./catalog.helpers";

let w: World;
let other: World;
const c = (r: keyof World["users"]) => w.users[r].cookie;

beforeEach(async () => {
  await resetEmulators();
  w = await seedBusiness("biz-a", "shop-a");
  other = await seedBusiness("biz-b", "shop-b");
});

async function makeCategory(name = "Shirts", extra: Record<string, unknown> = {}, who: keyof World["users"] = "OWNER") {
  const r = await cat(w.bizId, { action: "create", name, ...extra }, c(who));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.category as { id: string; slug: string; productCount: number };
}

describe("categories", () => {
  it("creates, derives a slug, and rejects invalid input", async () => {
    const a = await makeCategory("Summer Shirts");
    expect(a.slug).toBe("summer-shirts");
    const bad = await cat(w.bizId, { action: "create", name: "x" }, c("OWNER"));
    expect(bad.status).toBe(400);
    expect(bad.body.fieldErrors.name).toBeDefined();
    expect((await cat(w.bizId, { action: "create", name: "Ok name", slug: "Bad Slug!" }, c("OWNER"))).status).toBe(400);
  });

  it("slug is unique within a business: derived slugs get suffixes, explicit duplicates are refused", async () => {
    expect((await makeCategory("Hats")).slug).toBe("hats");
    expect((await makeCategory("Hats")).slug).toBe("hats-2");
    const dup = await cat(w.bizId, { action: "create", name: "Other", slug: "hats" }, c("OWNER"));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("slug_taken");
    expect(dup.body.fieldErrors.slug).toBeDefined();
    // The same slug is fine in a different business.
    const r = await cat(other.bizId, { action: "create", name: "Hats" }, other.users.OWNER.cookie);
    expect(r.body.category.slug).toBe("hats");
  });

  it("concurrent creates with the same name never produce duplicate slugs", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => cat(w.bizId, { action: "create", name: "Race" }, c("OWNER"))));
    const ok = results.filter((r) => r.status === 200).map((r) => r.body.category.slug as string);
    expect(new Set(ok).size).toBe(ok.length);
    expect(ok.length).toBeGreaterThan(0);
  });

  it("edits, renames the slug (releasing the old one) and toggles active", async () => {
    const a = await makeCategory("Bags");
    const up = await cat(w.bizId, { action: "update", id: a.id, name: "Bags & Totes", slug: "totes", description: "d", active: true }, c("OWNER"));
    expect(up.status).toBe(200);
    expect(up.body.category.slug).toBe("totes");
    // old slug is reusable, new one is taken
    expect((await makeCategory("Bags")).slug).toBe("bags");
    expect((await cat(w.bizId, { action: "create", name: "Z z", slug: "totes" }, c("OWNER"))).status).toBe(409);
    expect((await cat(w.bizId, { action: "setActive", id: a.id, active: false }, c("OWNER"))).status).toBe(200);
    expect((await adminDb().doc(`businesses/${w.bizId}/categories/${a.id}`).get()).get("active")).toBe(false);
  });

  it("reorders with move up/down and lists in sortOrder", async () => {
    const a = await makeCategory("One one");
    const b = await makeCategory("Two two");
    const d = await makeCategory("Three three");
    await cat(w.bizId, { action: "move", id: d.id, direction: "up" }, c("OWNER"));
    await cat(w.bizId, { action: "move", id: d.id, direction: "up" }, c("OWNER"));
    const page = await listCategories(w.bizId);
    expect(page.items.map((x) => x.id)).toEqual([d.id, a.id, b.id]);
    await cat(w.bizId, { action: "move", id: d.id, direction: "up" }, c("OWNER")); // already first: no-op
    expect((await listCategories(w.bizId)).items[0].id).toBe(d.id);
  });

  it("searches by name prefix and paginates with an opaque cursor", async () => {
    for (const n of ["Alpha one", "Alpine two", "Beta three", "Gamma four", "Delta five"]) await makeCategory(n);
    expect((await listCategories(w.bizId, { q: "alp" })).items.map((x) => x.name).sort()).toEqual(["Alpha one", "Alpine two"]);
    expect((await listCategories(w.bizId, { q: "ALP" })).items).toHaveLength(2);
    const p1 = await listCategories(w.bizId, { limit: 2 });
    const p2 = await listCategories(w.bizId, { limit: 2, cursor: p1.nextCursor! });
    const p3 = await listCategories(w.bizId, { limit: 2, cursor: p2.nextCursor! });
    expect([...p1.items, ...p2.items, ...p3.items]).toHaveLength(5);
    expect(p3.nextCursor).toBeNull();
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((x) => x.id)).size).toBe(5);
  });

  it("deleting is refused while products are assigned, allowed once empty; slug is released", async () => {
    const a = await makeCategory("Shoes");
    const p = await prod(w.bizId, { action: "create", product: validProduct(a.id) }, c("OWNER"));
    expect(p.status).toBe(200);
    const refused = await cat(w.bizId, { action: "delete", id: a.id }, c("OWNER"));
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("conflict");
    expect((await adminDb().doc(`businesses/${w.bizId}/categories/${a.id}`).get()).exists).toBe(true);

    expect((await prod(w.bizId, { action: "delete", id: p.body.product.id }, c("OWNER"))).status).toBe(200);
    expect((await cat(w.bizId, { action: "delete", id: a.id }, c("OWNER"))).status).toBe(200);
    expect((await makeCategory("Shoes")).slug).toBe("shoes");
  });

  it("category image: uploaded media is claimed, replaced media is released", async () => {
    const m1 = await pngId(w.bizId, c("OWNER"));
    const a = await makeCategory("Imaged", { imageId: m1 });
    expect((await adminDb().doc(`businesses/${w.bizId}/media/${m1}`).get()).get("ownerType")).toBe("category");
    const m2 = await pngId(w.bizId, c("OWNER"));
    await cat(w.bizId, { action: "update", id: a.id, name: "Imaged", imageId: m2, active: true }, c("OWNER"));
    expect((await adminDb().doc(`businesses/${w.bizId}/media/${m1}`).get()).get("deletedAt")).toBeTruthy();
    expect((await adminDb().doc(`businesses/${w.bizId}/media/${m2}`).get()).get("ownerId")).toBe(a.id);
  });
});

describe("products", () => {
  it("creates a draft, tracks productCount, derives a unique slug", async () => {
    const k = await makeCategory();
    const a = await prod(w.bizId, { action: "create", product: validProduct(k.id) }, c("OWNER"));
    const b = await prod(w.bizId, { action: "create", product: validProduct(k.id) }, c("OWNER"));
    expect(a.status).toBe(200);
    expect(a.body.product.slug).toBe("linen-shirt");
    expect(b.body.product.slug).toBe("linen-shirt-2");
    expect(a.body.product.currency).toBe("INR");
    expect((await adminDb().doc(`businesses/${w.bizId}/categories/${k.id}`).get()).get("productCount")).toBe(2);
    const dup = await prod(w.bizId, { action: "create", product: validProduct(k.id, { slug: "linen-shirt" }) }, c("OWNER"));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("slug_taken");
  });

  it("validates price (integer minor units), compare-at, required fields and image count", async () => {
    const k = await makeCategory();
    const bad = async (over: Record<string, unknown>, field: string) => {
      const r = await prod(w.bizId, { action: "create", product: validProduct(k.id, over) }, c("OWNER"));
      expect(r.status, field).toBe(400);
      expect(r.body.fieldErrors[field], field).toBeDefined();
    };
    await bad({ priceCents: 12.5 }, "priceCents");
    await bad({ priceCents: -1 }, "priceCents");
    await bad({ priceCents: "100" }, "priceCents");
    await bad({ priceCents: 99_999_999_999 }, "priceCents");
    await bad({ name: "" }, "name");
    await bad({ description: "   " }, "description");
    await bad({ compareAtPriceCents: 100, priceCents: 200 }, "compareAtPriceCents");
    await bad({ status: "active" }, "imageIds");
    await bad({ status: "nope" }, "status");
    await bad({ imageIds: Array.from({ length: 11 }, (_, i) => `id${i}`) }, "imageIds");
    const free = await prod(w.bizId, { action: "create", product: validProduct(k.id, { priceCents: 0 }) }, c("OWNER"));
    expect(free.status).toBe(200); // zero is a valid non-negative price
  });

  it("product must belong to a category in the SAME business", async () => {
    const mine = await makeCategory();
    const theirs = await cat(other.bizId, { action: "create", name: "Theirs" }, other.users.OWNER.cookie);
    const r = await prod(w.bizId, { action: "create", product: validProduct(theirs.body.category.id) }, c("OWNER"));
    expect(r.status).toBe(400);
    expect(r.body.fieldErrors.categoryId).toBeDefined();
    expect((await prod(w.bizId, { action: "create", product: validProduct("does-not-exist") }, c("OWNER"))).status).toBe(400);
    expect((await prod(w.bizId, { action: "create", product: validProduct(mine.id) }, c("OWNER"))).status).toBe(200);
  });

  it("publishing needs an image; images are ordered with a cover and removed images are released", async () => {
    const k = await makeCategory();
    const m1 = await pngId(w.bizId, c("OWNER"));
    const m2 = await pngId(w.bizId, c("OWNER"));
    const created = await prod(w.bizId, { action: "create", product: validProduct(k.id, { imageIds: [m1, m2] }) }, c("OWNER"));
    const id = created.body.product.id as string;
    expect(created.body.product.primaryImage.mediaId).toBe(m1);

    // publish via status action works because images exist
    expect((await prod(w.bizId, { action: "setStatus", id, status: "active" }, c("OWNER"))).status).toBe(200);

    // reorder cover
    const re = await prod(w.bizId, { action: "update", id, product: validProduct(k.id, { imageIds: [m2, m1], status: "active" }) }, c("OWNER"));
    expect(re.body.product.primaryImage.mediaId).toBe(m2);

    // drop m1: media doc marked deleted and Storage object removed
    const path = (await adminDb().doc(`businesses/${w.bizId}/media/${m1}`).get()).get("storagePath") as string;
    expect((await adminBucket().file(path).exists())[0]).toBe(true);
    await prod(w.bizId, { action: "update", id, product: validProduct(k.id, { imageIds: [m2], status: "active" }) }, c("OWNER"));
    expect((await adminDb().doc(`businesses/${w.bizId}/media/${m1}`).get()).get("deletedAt")).toBeTruthy();
    expect((await adminBucket().file(path).exists())[0]).toBe(false);

    // publishing a product with no images via setStatus is refused
    const bare = await prod(w.bizId, { action: "create", product: validProduct(k.id, { name: "Bare one" }) }, c("OWNER"));
    const r = await prod(w.bizId, { action: "setStatus", id: bare.body.product.id, status: "active" }, c("OWNER"));
    expect(r.status).toBe(400);
    // and clearing every image of a live product while keeping it live is refused
    expect((await prod(w.bizId, { action: "update", id, product: validProduct(k.id, { imageIds: [], status: "active" }) }, c("OWNER"))).status).toBe(400);
  });

  it("an image can only be used by one product, and never across businesses", async () => {
    const k = await makeCategory();
    const m = await pngId(w.bizId, c("OWNER"));
    const a = await prod(w.bizId, { action: "create", product: validProduct(k.id, { imageIds: [m] }) }, c("OWNER"));
    expect(a.status).toBe(200);
    const stolen = await prod(w.bizId, { action: "create", product: validProduct(k.id, { name: "Thief item", imageIds: [m] }) }, c("OWNER"));
    expect(stolen.status).toBe(400);
    expect(stolen.body.fieldErrors.imageIds).toBeDefined();

    const foreign = await pngId(other.bizId, other.users.OWNER.cookie);
    const r = await prod(w.bizId, { action: "create", product: validProduct(k.id, { name: "Cross tenant", imageIds: [foreign] }) }, c("OWNER"));
    expect(r.status).toBe(400);
    expect((await adminDb().doc(`businesses/${other.bizId}/media/${foreign}`).get()).get("ownerType")).toBeNull();
  });

  it("changing category moves the counters; deleting decrements and releases the slug", async () => {
    const k1 = await makeCategory("First one");
    const k2 = await makeCategory("Second one");
    const p = await prod(w.bizId, { action: "create", product: validProduct(k1.id) }, c("OWNER"));
    const id = p.body.product.id as string;
    await prod(w.bizId, { action: "update", id, product: validProduct(k2.id) }, c("OWNER"));
    const count = async (k: string) => (await adminDb().doc(`businesses/${w.bizId}/categories/${k}`).get()).get("productCount");
    expect([await count(k1.id), await count(k2.id)]).toEqual([0, 1]);
    await prod(w.bizId, { action: "delete", id }, c("OWNER"));
    expect(await count(k2.id)).toBe(0);
    const again = await prod(w.bizId, { action: "create", product: validProduct(k2.id) }, c("OWNER"));
    expect(again.body.product.slug).toBe("linen-shirt");
  });

  it("filters by status/category, searches by prefix, sorts and paginates", async () => {
    const k1 = await makeCategory("Tops one");
    const k2 = await makeCategory("Pants two");
    const mk = (name: string, k: string, priceCents: number, status = "draft") =>
      prod(w.bizId, { action: "create", product: validProduct(k, { name, priceCents, status: "draft" }) }, c("OWNER")).then(async (r) => {
        if (status === "archived") await prod(w.bizId, { action: "setStatus", id: r.body.product.id, status: "archived" }, c("OWNER"));
        return r;
      });
    await mk("Apple tee", k1.id, 500);
    await mk("Banana tee", k1.id, 300);
    await mk("Cherry pant", k2.id, 900);
    await mk("Date pant", k2.id, 100, "archived");
    await mk("Elder tee", k1.id, 700);

    const names = async (f: Parameters<typeof listProducts>[1]) => (await listProducts(w.bizId, f)).items.map((x) => x.name);
    expect(await names({ categoryId: k1.id, sort: "price", dir: "asc" })).toEqual(["Banana tee", "Apple tee", "Elder tee"]);
    expect(await names({ sort: "price", dir: "desc" })).toEqual(["Cherry pant", "Elder tee", "Apple tee", "Banana tee", "Date pant"]);
    expect(await names({ status: "archived" })).toEqual(["Date pant"]);
    expect(await names({ q: "ban" })).toEqual(["Banana tee"]);
    expect(await names({ q: "e", categoryId: k1.id })).toEqual(["Elder tee"]);
    expect(await names({ sort: "name", dir: "desc", limit: 2 })).toEqual(["Elder tee", "Date pant"]);
    expect((await listProducts(w.bizId, { categoryId: k2.id })).items.every((x) => x.categoryName === "Pants two")).toBe(true);

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const pg = await listProducts(w.bizId, { sort: "name", limit: 2, cursor });
      seen.push(...pg.items.map((x) => x.name));
      cursor = pg.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(["Apple tee", "Banana tee", "Cherry pant", "Date pant", "Elder tee"]);
  });
});

describe("roles (backend-enforced)", () => {
  it("EDITOR writes drafts only: cannot publish, archive, feature, delete or manage categories", async () => {
    const k = await makeCategory();
    const m = await pngId(w.bizId, c("EDITOR")); // editors may upload media
    const draft = await prod(w.bizId, { action: "create", product: validProduct(k.id, { imageIds: [m] }) }, c("EDITOR"));
    expect(draft.status).toBe(200);
    const id = draft.body.product.id as string;

    const forbidden = async (r: Promise<{ status: number; body: Json }>) => {
      const x = await r;
      expect(x.status).toBe(403);
      expect(x.body.code).toBe("forbidden");
    };
    await forbidden(prod(w.bizId, { action: "create", product: validProduct(k.id, { name: "Pub attempt", status: "active", imageIds: [await pngId(w.bizId, c("EDITOR"))] }) }, c("EDITOR")));
    await forbidden(prod(w.bizId, { action: "create", product: validProduct(k.id, { name: "Feat attempt", featured: true }) }, c("EDITOR")));
    await forbidden(prod(w.bizId, { action: "setStatus", id, status: "active" }, c("EDITOR")));
    await forbidden(prod(w.bizId, { action: "update", id, product: validProduct(k.id, { imageIds: [m], status: "archived" }) }, c("EDITOR")));
    await forbidden(prod(w.bizId, { action: "delete", id }, c("EDITOR")));
    await forbidden(cat(w.bizId, { action: "create", name: "Editor cat" }, c("EDITOR")));
    await forbidden(cat(w.bizId, { action: "delete", id: k.id }, c("EDITOR")));
    await forbidden(settings(w.bizId, { action: "publish", published: true }, c("EDITOR")));
    await forbidden(settings(w.bizId, { action: "branding", primaryColor: "#000000", secondaryColor: "#000000", accentColor: "#000000", defaultTheme: "light", logoId: null }, c("EDITOR")));
    // editing the draft (same status) is allowed
    expect((await prod(w.bizId, { action: "update", id, product: validProduct(k.id, { name: "Renamed", imageIds: [m] }) }, c("EDITOR"))).status).toBe(200);
    // and an editor can edit a LIVE product without changing its status
    await prod(w.bizId, { action: "setStatus", id, status: "active" }, c("MANAGER"));
    const live = await prod(w.bizId, { action: "update", id, product: validProduct(k.id, { name: "Renamed again", imageIds: [m], status: "active" }) }, c("EDITOR"));
    expect(live.status).toBe(200);
    expect(live.body.product.status).toBe("active");
  });

  it("MANAGER: full catalogue + branding, no store publishing; ADMIN/OWNER: everything", async () => {
    const k = await makeCategory("Mgr cat", {}, "MANAGER");
    const m = await pngId(w.bizId, c("MANAGER"));
    const p = await prod(w.bizId, { action: "create", product: validProduct(k.id, { status: "active", featured: true, imageIds: [m] }) }, c("MANAGER"));
    expect(p.status).toBe(200);
    expect((await prod(w.bizId, { action: "delete", id: p.body.product.id }, c("MANAGER"))).status).toBe(200);
    expect((await cat(w.bizId, { action: "delete", id: k.id }, c("MANAGER"))).status).toBe(200);
    const branding = { action: "branding", primaryColor: "#112233", secondaryColor: "#445566", accentColor: "#778899", defaultTheme: "dark", logoId: null };
    expect((await settings(w.bizId, branding, c("MANAGER"))).status).toBe(200);
    expect((await settings(w.bizId, { action: "publish", published: true }, c("MANAGER"))).status).toBe(403);
    for (const r of ["ADMIN", "OWNER"] as const) {
      expect((await settings(w.bizId, { action: "publish", published: r === "OWNER" }, c(r))).status).toBe(200);
      expect((await cat(w.bizId, { action: "create", name: `By ${r}` }, c(r))).status).toBe(200);
    }
  });

  it("cross-business access is impossible: another tenant's users, URL tampering and foreign ids", async () => {
    const k = await makeCategory();
    const p = await prod(w.bizId, { action: "create", product: validProduct(k.id) }, c("OWNER"));
    const intruder = other.users.OWNER.cookie; // owns biz-b, NOT biz-a
    for (const r of [
      cat(w.bizId, { action: "create", name: "Intruder cat" }, intruder),
      cat(w.bizId, { action: "delete", id: k.id }, intruder),
      prod(w.bizId, { action: "delete", id: p.body.product.id }, intruder),
      prod(w.bizId, { action: "create", product: validProduct(k.id) }, intruder),
      settings(w.bizId, { action: "publish", published: true }, intruder),
      cat(w.bizId, { action: "create", name: "Outsider cat" }, c("outsider")),
    ]) {
      const x = await r;
      expect(x.status).toBe(403);
    }
    // the same business id in the body/URL for B's own business cannot reach A's records
    const nf = await prod(other.bizId, { action: "delete", id: p.body.product.id }, intruder);
    expect(nf.status).toBe(404);
    expect((await adminDb().doc(`businesses/${w.bizId}/products/${p.body.product.id}`).get()).exists).toBe(true);
    const nf2 = await cat(other.bizId, { action: "delete", id: k.id }, intruder);
    expect(nf2.status).toBe(404);
    // malformed / unknown business ids look identical
    expect((await cat("../x", { action: "create", name: "Path trick" }, c("OWNER"))).status).toBe(403);
    expect((await cat("no-such-biz", { action: "create", name: "Nowhere" }, c("OWNER"))).status).toBe(403);
    // anonymous
    expect((await cat(w.bizId, { action: "create", name: "Anon" })).status).toBe(401);
  });

  it("unverified email and CSRF failures are refused; role and businessId are never taken from the body", async () => {
    const unverified = await (await import("./helpers")).makeUser({ verified: false });
    expect((await cat(w.bizId, { action: "create", name: "Unverified" }, unverified.cookie)).status).toBe(403);
    const noHeader = await (await import("./catalog.helpers")).call(
      (await import("@/app/api/b/[businessId]/categories/route")).POST, w.bizId, { action: "create", name: "No csrf" }, c("OWNER"), { headers: { "x-requested-with": null } },
    );
    expect(noHeader.body.code).toBe("csrf");
    const smuggle = await cat(w.bizId, { action: "create", name: "Smuggle", businessId: other.bizId, role: "OWNER" }, c("OWNER"));
    expect(smuggle.status).toBe(200);
    const stored = await adminDb().doc(`businesses/${w.bizId}/categories/${smuggle.body.category.id}`).get();
    expect(stored.get("businessId")).toBe(w.bizId);
    expect((await adminDb().collection(`businesses/${other.bizId}/categories`).get()).size).toBe(0);
  });
});

describe("image upload & serving", () => {
  it("accepts PNG/JPEG/WebP by content, stores under the business folder and creates a media record", async () => {
    for (const [bytes, type, ext] of [[PNG, "image/png", "png"], [JPEG, "image/jpeg", "jpg"], [WEBP, "image/webp", "webp"]] as const) {
      const r = await upload(w.bizId, bytes, `a.${ext}`, type, c("OWNER"));
      expect(r.status).toBe(200);
      const doc = await adminDb().doc(`businesses/${w.bizId}/media/${r.body.media.mediaId}`).get();
      expect(doc.get("storagePath")).toMatch(new RegExp(`^businesses/${w.bizId}/media/[0-9a-f-]{36}\\.${ext}$`));
      expect(doc.get("businessId")).toBe(w.bizId);
      expect(doc.get("ownerType")).toBeNull();
      expect((await adminBucket().file(doc.get("storagePath")).exists())[0]).toBe(true);
    }
  });

  it("rejects non-images regardless of declared type, empty and oversized files", async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect((await upload(w.bizId, enc("hello"), "x.png", "image/png", c("OWNER"))).status).toBe(400);
    expect((await upload(w.bizId, enc("<svg xmlns='http://www.w3.org/2000/svg'/>"), "x.svg", "image/svg+xml", c("OWNER"))).status).toBe(400);
    expect((await upload(w.bizId, enc("GIF89a....."), "x.gif", "image/gif", c("OWNER"))).status).toBe(400);
    expect((await upload(w.bizId, enc("%PDF-1.4"), "x.pdf", "application/pdf", c("OWNER"))).status).toBe(400);
    expect((await upload(w.bizId, new Uint8Array(0), "e.png", "image/png", c("OWNER"))).status).toBe(400);
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set(PNG);
    const r = await upload(w.bizId, big, "big.png", "image/png", c("OWNER"));
    expect(r.status).toBe(400);
    expect((await adminDb().collection(`businesses/${w.bizId}/media`).get()).size).toBe(0);
  });

  it("uploads need membership + media:upload; every tenant gets its own folder", async () => {
    expect((await upload(w.bizId, PNG, "a.png", "image/png")).status).toBe(401);
    expect((await upload(w.bizId, PNG, "a.png", "image/png", c("outsider"))).status).toBe(403);
    expect((await upload(w.bizId, PNG, "a.png", "image/png", other.users.OWNER.cookie)).status).toBe(403);
    expect((await upload(w.bizId, PNG, "a.png", "image/png", c("EDITOR"))).status).toBe(200);
  });

  it("members can preview any of their media; non-members cannot, even with the exact id", async () => {
    const m = await pngId(w.bizId, c("EDITOR"));
    const ok = await getAdminMedia(w.bizId, m, c("MANAGER"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await getAdminMedia(w.bizId, m, other.users.OWNER.cookie)).status).toBe(403);
    expect((await getAdminMedia(w.bizId, m)).status).toBe(401);
    expect((await getAdminMedia(other.bizId, m, other.users.OWNER.cookie)).status).toBe(404);
  });
});
