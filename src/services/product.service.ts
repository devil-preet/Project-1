import "server-only";
import { FieldValue, type DocumentData, type Query } from "firebase-admin/firestore";
import { AuthError } from "@/lib/auth/errors";
import { adminDb } from "@/lib/firebase/admin";
import { iso } from "@/lib/firebase/firestore";
import { normalizeSearch, productQueryPlan, type ProductFilter } from "@/lib/catalog/query-plan";
import type { ProductDTO } from "@/lib/catalog/types";
import { DEFAULT_CURRENCY, isCurrency } from "@/lib/utils/money";
import { PAGE_SIZE, type ProductInput } from "@/lib/validations/catalog";
import type { MediaRef, Page, ProductStatus } from "@/types";
import { chooseSlug, release, reserve } from "./catalog.shared";
import { adminMediaUrl, loadMediaForOwner, releaseMedia } from "./media.service";

const col = (businessId: string) => adminDb().collection(`businesses/${businessId}/products`);
const catRef = (businessId: string, id: string) => adminDb().doc(`businesses/${businessId}/categories/${id}`);

export function productDTO(businessId: string, id: string, d: DocumentData, categoryName = ""): ProductDTO {
  const images = ((d.images as MediaRef[] | undefined) ?? []).map((m) => ({
    mediaId: m.mediaId,
    alt: m.alt,
    url: adminMediaUrl(businessId, m.mediaId),
  }));
  return {
    id,
    name: d.name,
    slug: d.slug,
    categoryId: d.categoryId ?? "",
    categoryName,
    shortDescription: d.shortDescription ?? "",
    description: d.description ?? "",
    images,
    primaryImage: images[0] ?? null,
    priceCents: d.priceCents,
    compareAtPriceCents: d.compareAtPriceCents ?? null,
    currency: d.currency ?? DEFAULT_CURRENCY,
    sku: d.sku ?? "",
    stockQuantity: d.stockQuantity ?? null,
    status: d.status,
    availability: d.availability ?? "in_stock",
    featured: d.featured === true,
    sortOrder: d.sortOrder ?? 0,
    seoTitle: d.seoTitle ?? "",
    seoDescription: d.seoDescription ?? "",
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export async function storeCurrency(businessId: string): Promise<string> {
  const snap = await adminDb().doc(`businesses/${businessId}/settings/store`).get();
  const c = snap.get("currency");
  return isCurrency(c) ? c : DEFAULT_CURRENCY;
}

export interface ProductListOptions extends ProductFilter {
  cursor?: string;
  limit?: number;
}

/** Admin list: filter by status/category, sort by name/price/created, prefix-search, cursor pagination. */
export async function listProducts(businessId: string, opts: ProductListOptions = {}): Promise<Page<ProductDTO>> {
  const plan = productQueryPlan(opts);
  const limit = Math.min(opts.limit ?? PAGE_SIZE, 60);
  let q: Query = col(businessId);
  if (opts.categoryId) q = q.where("categoryId", "==", opts.categoryId);
  if (opts.status) q = q.where("status", "==", opts.status);
  if (opts.featured !== undefined) q = q.where("featured", "==", opts.featured);
  if (plan.prefix) {
    const p = normalizeSearch(opts.q);
    q = q.where("searchName", ">=", p).where("searchName", "<", p + "");
  }
  q = q.orderBy(plan.orderBy, plan.dir);
  if (opts.cursor) {
    const c = await col(businessId).doc(opts.cursor).get();
    if (c.exists) q = q.startAfter(c);
  }
  const [snap, cats] = await Promise.all([
    q.limit(limit + 1).get(),
    adminDb().collection(`businesses/${businessId}/categories`).limit(200).get(),
  ]);
  const names = new Map(cats.docs.map((c) => [c.id, c.get("name") as string]));
  const docs = snap.docs.slice(0, limit);
  return {
    items: docs.map((d) => productDTO(businessId, d.id, d.data(), names.get(d.get("categoryId")) ?? "")),
    nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : null,
  };
}

export async function getProduct(businessId: string, id: string): Promise<ProductDTO | null> {
  const snap = await col(businessId).doc(id).get();
  if (!snap.exists) return null;
  const cat = snap.get("categoryId") ? await catRef(businessId, snap.get("categoryId")).get() : null;
  return productDTO(businessId, snap.id, snap.data()!, (cat?.get("name") as string) ?? "");
}

/** What the caller's role may do with status/featured. Backend-authoritative (the UI mirrors it). */
export interface ProductActor {
  canPublish: boolean;
}

function assertStatusAllowed(actor: ProductActor, from: ProductStatus | null, to: ProductStatus, featuredChanged: boolean) {
  const changesVisibility = (from ?? "draft") !== to || featuredChanged;
  if (changesVisibility && !actor.canPublish && !(from === null && to === "draft" && !featuredChanged)) {
    throw new AuthError("forbidden", "Your role can save drafts but cannot publish, archive or feature products.");
  }
}

/** Business-wide product slug registry uses slugReservations; the category counter is updated in the same transaction. */
export async function createProduct(businessId: string, input: ProductInput, actor: ProductActor): Promise<ProductDTO> {
  assertStatusAllowed(actor, null, input.status, input.featured);
  const db = adminDb();
  const currency = await storeCurrency(businessId);
  const ref = col(businessId).doc();

  const result = await db.runTransaction(async (tx) => {
    const cat = await tx.get(catRef(businessId, input.categoryId));
    if (!cat.exists) throw new AuthError("invalid_input", "Choose a category from this business.", { fieldErrors: { categoryId: ["Choose a category"] } });
    const media = await loadMediaForOwner(db, tx, businessId, input.imageIds, { type: "product", id: ref.id }, input.name);
    const slug = await chooseSlug(db, tx, businessId, "product", { explicit: input.slug, name: input.name, selfId: ref.id });
    if (input.status === "active" && media.refs.length === 0) {
      throw new AuthError("invalid_input", "Add at least one image before publishing.", { fieldErrors: { imageIds: ["Add at least one image"] } });
    }
    const now = FieldValue.serverTimestamp();
    const data = {
      businessId,
      name: input.name,
      slug,
      shortDescription: input.shortDescription,
      description: input.description,
      categoryId: input.categoryId,
      images: media.refs,
      priceCents: input.priceCents,
      compareAtPriceCents: input.compareAtPriceCents,
      currency,
      sku: input.sku,
      stockQuantity: input.stockQuantity,
      status: input.status,
      availability: input.availability,
      featured: input.featured,
      sortOrder: input.sortOrder,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      searchName: input.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    tx.create(ref, data);
    reserve(db, tx, businessId, "product", slug, ref.id);
    tx.update(cat.ref, { productCount: FieldValue.increment(1), updatedAt: now });
    media.claim();
    return { data, cat: cat.get("name") as string };
  });
  return productDTO(businessId, ref.id, result.data, result.cat);
}

export async function updateProduct(businessId: string, id: string, input: ProductInput, actor: ProductActor): Promise<ProductDTO> {
  const db = adminDb();
  const ref = col(businessId).doc(id);
  let removed: MediaRef[] = [];

  const result = await db.runTransaction(async (tx) => {
    removed = [];
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AuthError("not_found");
    const cur = snap.data() as DocumentData;
    assertStatusAllowed(actor, cur.status, input.status, (cur.featured === true) !== input.featured);

    const sameCat = cur.categoryId === input.categoryId;
    const [newCat, oldCat] = await Promise.all([
      tx.get(catRef(businessId, input.categoryId)),
      sameCat ? Promise.resolve(null) : tx.get(catRef(businessId, cur.categoryId)),
    ]);
    if (!newCat.exists) throw new AuthError("invalid_input", "Choose a category from this business.", { fieldErrors: { categoryId: ["Choose a category"] } });

    const media = await loadMediaForOwner(db, tx, businessId, input.imageIds, { type: "product", id }, input.name);
    const slug = input.slug && input.slug !== cur.slug
      ? await chooseSlug(db, tx, businessId, "product", { explicit: input.slug, name: input.name, selfId: id })
      : (cur.slug as string);
    if (input.status === "active" && media.refs.length === 0) {
      throw new AuthError("invalid_input", "Add at least one image before publishing.", { fieldErrors: { imageIds: ["Add at least one image"] } });
    }

    // Keep the stored ref for images that stay; images no longer listed are released after commit.
    const prev = new Map(((cur.images as MediaRef[]) ?? []).map((m) => [m.mediaId, m]));
    const images = media.refs.map((r) => ({ ...r, ...(prev.get(r.mediaId) ?? {}), alt: input.name }));
    removed = [...prev.values()].filter((m) => !input.imageIds.includes(m.mediaId));

    const now = FieldValue.serverTimestamp();
    const patch = {
      name: input.name, slug, shortDescription: input.shortDescription, description: input.description,
      categoryId: input.categoryId, images, priceCents: input.priceCents, compareAtPriceCents: input.compareAtPriceCents,
      sku: input.sku, stockQuantity: input.stockQuantity, status: input.status, availability: input.availability,
      featured: input.featured, sortOrder: input.sortOrder, seoTitle: input.seoTitle, seoDescription: input.seoDescription,
      searchName: input.name.toLowerCase(), updatedAt: now,
    };
    tx.update(ref, patch);
    if (slug !== cur.slug) {
      release(db, tx, businessId, "product", cur.slug);
      reserve(db, tx, businessId, "product", slug, id);
    }
    if (!sameCat && oldCat) {
      if (oldCat.exists) tx.update(oldCat.ref, { productCount: FieldValue.increment(-1), updatedAt: now });
      tx.update(newCat.ref, { productCount: FieldValue.increment(1), updatedAt: now });
    }
    media.claim();
    return { next: { ...cur, ...patch }, cat: newCat.get("name") as string };
  });
  if (removed.length) await releaseMedia(db, businessId, removed);
  return productDTO(businessId, id, result.next, result.cat);
}

/** Quick status change (publish / unpublish / archive). Publishing re-checks the image rule. */
export async function setProductStatus(businessId: string, id: string, status: ProductStatus, actor: ProductActor): Promise<void> {
  const db = adminDb();
  const ref = col(businessId).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AuthError("not_found");
    assertStatusAllowed(actor, snap.get("status"), status, false);
    if (status === "active" && ((snap.get("images") as unknown[]) ?? []).length === 0) {
      throw new AuthError("invalid_input", "Add at least one image before publishing.", { fieldErrors: { imageIds: ["Add at least one image"] } });
    }
    tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function deleteProduct(businessId: string, id: string): Promise<void> {
  const db = adminDb();
  const ref = col(businessId).doc(id);
  let images: MediaRef[] = [];
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AuthError("not_found");
    const cat = await tx.get(catRef(businessId, snap.get("categoryId")));
    images = (snap.get("images") as MediaRef[]) ?? [];
    tx.delete(ref);
    release(db, tx, businessId, "product", snap.get("slug") as string);
    if (cat.exists) tx.update(cat.ref, { productCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() });
  });
  if (images.length) await releaseMedia(db, businessId, images);
}
