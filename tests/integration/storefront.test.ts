import { beforeEach, describe, expect, it } from "vitest";
import { adminDb } from "@/lib/firebase/admin";
import {
  getPublicCategories, getPublicCategoryBySlug, getPublicProductBySlug, getPublicStore, listPublicProducts,
  type PublicStore,
} from "@/services/public-store.service";
import { resetEmulators } from "./helpers";
import { cat, getPublicMediaRes, pngId, prod, seedBusiness, settings, validProduct, type World } from "./catalog.helpers";

let w: World;
let store: PublicStore;
const owner = () => w.users.OWNER.cookie;
const bytesOf = async (r: Response) => new Uint8Array(await r.arrayBuffer());

interface Seeded {
  catA: { id: string; slug: string };
  catB: { id: string; slug: string };
  live: { id: string; slug: string; imageId: string };
  draft: { id: string; slug: string; imageId: string };
  archived: { id: string; slug: string; imageId: string };
  hiddenCatProduct: { id: string; slug: string; imageId: string };
  catHidden: { id: string; slug: string; imageId: string };
}

/** One published store with live/draft/archived products and an inactive category holding a live product. */
async function seedCatalog(): Promise<Seeded> {
  const mk = async (name: string, extra: Record<string, unknown> = {}) => {
    const r = await cat(w.bizId, { action: "create", name, ...extra }, owner());
    return r.body.category as { id: string; slug: string };
  };
  const catA = await mk("Tees");
  const catB = await mk("Pants");
  const catHiddenImage = await pngId(w.bizId, owner());
  const catHiddenBase = await mk("Secret", { active: false, imageId: catHiddenImage });
  const catHidden = { ...catHiddenBase, imageId: catHiddenImage };

  const mkp = async (name: string, categoryId: string, status: string, over: Record<string, unknown> = {}) => {
    const imageId = await pngId(w.bizId, owner());
    const r = await prod(w.bizId, { action: "create", product: validProduct(categoryId, { name, imageIds: [imageId], status: "draft", ...over }) }, owner());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    if (status !== "draft") await prod(w.bizId, { action: "setStatus", id: r.body.product.id, status }, owner());
    return { id: r.body.product.id as string, slug: r.body.product.slug as string, imageId };
  };
  return {
    catA, catB,
    live: await mkp("Live tee", catA.id, "active", { featured: true, stockQuantity: 7, compareAtPriceCents: 200000, sku: "SKU-1" }),
    draft: await mkp("Draft tee", catA.id, "draft"),
    archived: await mkp("Archived tee", catA.id, "archived"),
    hiddenCatProduct: await mkp("In hidden category", catHidden.id, "active"),
    catHidden,
  };
}

async function publish(published: boolean) {
  expect((await settings(w.bizId, { action: "publish", published }, owner())).status).toBe(200);
  store = (await getPublicStore(w.slug))!;
}

beforeEach(async () => {
  await resetEmulators();
  w = await seedBusiness("biz-a", "shop-a");
});

describe("public storefront reads", () => {
  it("unpublished, deleted, unknown and malformed stores are all just 'not found'", async () => {
    await seedCatalog();
    expect(await getPublicStore("shop-a")).toBeNull(); // unpublished
    await publish(true);
    expect(store?.slug).toBe("shop-a");
    expect(await getPublicStore("does-not-exist")).toBeNull();
    for (const bad of ["../etc", "UPPER", "a b", "", "x".repeat(60), "-bad-"]) expect(await getPublicStore(bad), bad).toBeNull();
    await adminDb().doc("businesses/biz-a").update({ deletedAt: new Date() });
    expect(await getPublicStore("shop-a")).toBeNull();
    await adminDb().doc("businesses/biz-a").update({ deletedAt: null });
    await adminDb().doc("businesses/biz-a/settings/store").update({ publicVisibility: false });
    expect(await getPublicStore("shop-a")).toBeNull();
  });

  it("unpublishing hides everything again", async () => {
    await seedCatalog();
    await publish(true);
    expect(await getPublicStore("shop-a")).not.toBeNull();
    await publish(false);
    expect(store).toBeNull();
  });

  it("exposes only approved storefront fields (no owner, members, storage paths, stock, timestamps)", async () => {
    const s = await seedCatalog();
    await publish(true);
    const flat = JSON.stringify({ store, cats: await getPublicCategories(store.businessId), p: await getPublicProductBySlug(store, s.live.slug) });
    for (const secret of ["ownerId", w.users.OWNER.uid, w.users.OWNER.email, "storagePath", "stockQuantity", "createdAt", "updatedAt", "deletedAt", "businesses/", "members", "searchName"]) {
      expect(flat, secret).not.toContain(secret);
    }
    expect(Object.keys(store).sort()).toEqual(["businessId", "contactEmail", "contactPhone", "currency", "description", "logo", "name", "slug", "social", "theme"]);
    // public image URLs point at the verified public route, never at Storage
    expect(flat).toContain("/api/public/media/");
    expect(flat).not.toContain("googleapis");
  });

  it("only ACTIVE products in ACTIVE categories are listed; draft, archived and hidden-category ones never are", async () => {
    const s = await seedCatalog();
    await publish(true);
    const names = (await listPublicProducts(store)).items.map((p) => p.name);
    expect(names).toEqual(["Live tee"]);
    expect((await listPublicProducts(store, { categoryId: s.catA.id })).items.map((p) => p.name)).toEqual(["Live tee"]);
    expect((await listPublicProducts(store, { categoryId: s.catHidden.id })).items).toEqual([]);
    expect((await listPublicProducts(store, { featured: true })).items.map((p) => p.name)).toEqual(["Live tee"]);
    expect((await getPublicCategories(store.businessId)).map((c) => c.name)).toEqual(["Tees", "Pants"]);
  });

  it("category and product detail lookups respect status and category visibility", async () => {
    const s = await seedCatalog();
    await publish(true);
    expect((await getPublicCategoryBySlug(store, s.catA.slug))?.name).toBe("Tees");
    expect(await getPublicCategoryBySlug(store, s.catHidden.slug)).toBeNull();
    expect(await getPublicCategoryBySlug(store, "nope")).toBeNull();
    const p = await getPublicProductBySlug(store, s.live.slug);
    expect(p).toMatchObject({ name: "Live tee", priceCents: 129900, compareAtPriceCents: 200000, sku: "SKU-1", inStock: true, categorySlug: s.catA.slug });
    expect(p?.images).toHaveLength(1);
    expect(await getPublicProductBySlug(store, s.draft.slug)).toBeNull();
    expect(await getPublicProductBySlug(store, s.archived.slug)).toBeNull();
    expect(await getPublicProductBySlug(store, s.hiddenCatProduct.slug)).toBeNull();
    expect(await getPublicProductBySlug(store, "..%2f")).toBeNull();
    // reactivating the category makes its product visible; deactivating hides it again immediately
    await cat(w.bizId, { action: "setActive", id: s.catHidden.id, active: true }, owner());
    expect((await getPublicProductBySlug(store, s.hiddenCatProduct.slug))?.name).toBe("In hidden category");
    await cat(w.bizId, { action: "setActive", id: s.catHidden.id, active: false }, owner());
    expect(await getPublicProductBySlug(store, s.hiddenCatProduct.slug)).toBeNull();
  });

  it("out-of-stock products are shown but flagged", async () => {
    const s = await seedCatalog();
    await publish(true);
    const doc = adminDb().doc(`businesses/biz-a/products/${s.live.id}`);
    await doc.update({ availability: "out_of_stock" });
    expect((await getPublicProductBySlug(store, s.live.slug))?.inStock).toBe(false);
  });

  it("listing is bounded and paginates across many products (skipping hidden ones)", async () => {
    const s = await seedCatalog();
    await publish(true);
    const img = await pngId(w.bizId, owner());
    // 7 more live products in the visible category
    for (let i = 0; i < 7; i++) {
      const imageId = i === 0 ? img : await pngId(w.bizId, owner());
      await prod(w.bizId, { action: "create", product: validProduct(s.catA.id, { name: `Extra ${i}`, imageIds: [imageId], status: "active" }) }, owner());
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const pg = await listPublicProducts(store, { limit: 3, cursor });
      expect(pg.items.length).toBeLessThanOrEqual(3);
      seen.push(...pg.items.map((p) => p.name));
      cursor = pg.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
    expect(seen).not.toContain("Draft tee");
    expect(seen).not.toContain("In hidden category");
    const sorted = (await listPublicProducts(store, { categoryId: s.catA.id, sort: "price", dir: "asc", limit: 48 })).items.map((p) => p.priceCents);
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
    expect((await listPublicProducts(store, { limit: 1000 })).items.length).toBeLessThanOrEqual(48);
  });

  it("an empty published store renders nothing rather than failing", async () => {
    await publish(true);
    expect((await listPublicProducts(store)).items).toEqual([]);
    expect(await getPublicCategories(store.businessId)).toEqual([]);
  });

  it("tenants are isolated: one store's slug never resolves another store's data", async () => {
    const s = await seedCatalog();
    await publish(true);
    const other = await seedBusiness("biz-b", "shop-b", { published: true });
    const otherStore = (await getPublicStore("shop-b"))!;
    expect((await listPublicProducts(otherStore)).items).toEqual([]);
    expect(await getPublicProductBySlug(otherStore, s.live.slug)).toBeNull();
    expect(await getPublicCategoryBySlug(otherStore, s.catA.slug)).toBeNull();
    expect(other.bizId).not.toBe(w.bizId);
  });

  it("currency cannot change once products exist; an empty store may switch", async () => {
    const before = await settings(w.bizId, { action: "store", displayName: "Shop A", description: "d", currency: "USD" }, owner());
    expect(before.status).toBe(200);
    const k = await cat(w.bizId, { action: "create", name: "Any cat" }, owner());
    const p = await prod(w.bizId, { action: "create", product: validProduct(k.body.category.id) }, owner());
    expect(p.body.product.currency).toBe("USD");
    const locked = await settings(w.bizId, { action: "store", displayName: "Shop A", description: "d", currency: "EUR" }, owner());
    expect(locked.status).toBe(409);
    expect(locked.body.fieldErrors.currency).toBeDefined();
    expect((await settings(w.bizId, { action: "store", displayName: "Shop A2", description: "d", currency: "USD" }, owner())).status).toBe(200);
  });
});

describe("public image route", () => {
  it("serves images only while they are attached to something customers can see", async () => {
    const s = await seedCatalog();
    // store not yet published: nothing is public
    expect((await getPublicMediaRes(w.bizId, s.live.imageId)).status).toBe(404);
    await publish(true);

    const live = await getPublicMediaRes(w.bizId, s.live.imageId);
    expect(live.status).toBe(200);
    expect(live.headers.get("content-type")).toBe("image/png");
    expect(live.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await bytesOf(live)).length).toBeGreaterThan(8);

    expect((await getPublicMediaRes(w.bizId, s.draft.imageId)).status).toBe(404);
    expect((await getPublicMediaRes(w.bizId, s.archived.imageId)).status).toBe(404);
    expect((await getPublicMediaRes(w.bizId, s.hiddenCatProduct.imageId)).status).toBe(404);
    expect((await getPublicMediaRes(w.bizId, s.catHidden.imageId)).status).toBe(404);

    // an upload that no product/category/branding has claimed is private
    const orphan = await pngId(w.bizId, owner());
    expect((await getPublicMediaRes(w.bizId, orphan)).status).toBe(404);

    // visibility follows the product: archive it and its image disappears
    await prod(w.bizId, { action: "setStatus", id: s.live.id, status: "archived" }, owner());
    expect((await getPublicMediaRes(w.bizId, s.live.imageId)).status).toBe(404);
    await prod(w.bizId, { action: "setStatus", id: s.live.id, status: "active" }, owner());
    expect((await getPublicMediaRes(w.bizId, s.live.imageId)).status).toBe(200);

    // an active category image is public; deactivating hides it
    const catImg = await pngId(w.bizId, owner());
    const k = await cat(w.bizId, { action: "create", name: "Shown cat", imageId: catImg }, owner());
    expect((await getPublicMediaRes(w.bizId, catImg)).status).toBe(200);
    await cat(w.bizId, { action: "setActive", id: k.body.category.id, active: false }, owner());
    expect((await getPublicMediaRes(w.bizId, catImg)).status).toBe(404);

    // unpublishing the store hides all of it
    await publish(false);
    expect((await getPublicMediaRes(w.bizId, s.live.imageId)).status).toBe(404);
  });

  it("caches briefly and revalidates: short max-age, ETag, 304 only while still visible, never a 304 once hidden", async () => {
    const s = await seedCatalog();
    await publish(true);
    const first = await getPublicMediaRes(w.bizId, s.live.imageId);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60, must-revalidate");
    const etag = first.headers.get("etag")!;
    expect(etag).toBe(`"${s.live.imageId}"`);
    const again = await getPublicMediaRes(w.bizId, s.live.imageId, { "if-none-match": etag });
    expect(again.status).toBe(304);
    expect((await bytesOf(again)).length).toBe(0);
    // hide the product: a revalidation from a cache that still holds the image must now get 404, not 304
    await prod(w.bizId, { action: "setStatus", id: s.live.id, status: "archived" }, owner());
    expect((await getPublicMediaRes(w.bizId, s.live.imageId, { "if-none-match": etag })).status).toBe(404);
  });

  it("branding logo is public for a published store; ids cannot be used across tenants", async () => {
    const s = await seedCatalog();
    await publish(true);
    const logo = await pngId(w.bizId, owner());
    expect((await settings(w.bizId, { action: "branding", primaryColor: "#112233", secondaryColor: "#445566", accentColor: "#778899", defaultTheme: "light", logoId: logo }, owner())).status).toBe(200);
    expect((await getPublicMediaRes(w.bizId, logo)).status).toBe(200);
    expect((await getPublicStore("shop-a"))?.logo?.url).toBe(`/api/public/media/${w.bizId}/${logo}`);

    const other = await seedBusiness("biz-b", "shop-b", { published: true });
    // biz-a's live image requested under biz-b's id is not found; malformed ids too
    expect((await getPublicMediaRes(other.bizId, s.live.imageId)).status).toBe(404);
    expect((await getPublicMediaRes("../biz-a", s.live.imageId)).status).toBe(404);
    expect((await getPublicMediaRes(w.bizId, "..%2f..%2fx")).status).toBe(404);
  });
});
