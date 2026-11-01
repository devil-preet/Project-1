import "server-only";
import { cache } from "react";
import type { DocumentData, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { productQueryPlan, type ProductSort } from "@/lib/catalog/query-plan";
import { DEFAULT_CURRENCY, isCurrency } from "@/lib/utils/money";
import { MAX_CATEGORIES, PAGE_SIZE } from "@/lib/validations/catalog";
import type { MediaRef, Page } from "@/types";
import { reservationPath } from "./catalog.shared";
import { publicMediaUrl } from "./media.service";

/**
 * PUBLIC storefront reads. Everything here runs on the server with the Admin SDK (the live Firestore rules
 * are deny-all) and returns ONLY explicitly approved fields. No membership, owner id, internal settings,
 * storage paths, stock counts, timestamps or draft/archived data ever leave this module.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface PublicImage {
  url: string;
  alt: string;
}
export interface PublicStore {
  businessId: string;
  slug: string;
  name: string;
  description: string;
  logo: PublicImage | null;
  currency: string;
  contactEmail: string;
  contactPhone: string;
  social: { instagram: string; facebook: string; x: string; tiktok: string; website: string };
  theme: { primary: string; secondary: string; accent: string; background: string; mode: "light" | "dark" };
}
export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: PublicImage | null;
}
export interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  images: PublicImage[];
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  sku: string;
  inStock: boolean;
  featured: boolean;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
}

const hex = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Slug -> published store, or null (unknown slug, unpublished, deleted — indistinguishable to callers). */
export const getPublicStore = cache(async (slug: string): Promise<PublicStore | null> => {
  if (!SLUG.test(slug) || slug.length > 48) return null;
  const db = adminDb();
  const reg = await db.doc(`slugs/${slug}`).get();
  const businessId = reg.get("businessId");
  if (!reg.exists || typeof businessId !== "string" || !ID.test(businessId)) return null;

  const [biz, branding, store] = await db.getAll(
    db.doc(`businesses/${businessId}`),
    db.doc(`businesses/${businessId}/settings/branding`),
    db.doc(`businesses/${businessId}/settings/store`),
  );
  if (!biz.exists || biz.get("deletedAt") || biz.get("storeStatus") !== "published") return null;
  if (store.exists && store.get("publicVisibility") === false) return null;

  const logo = branding.get("logo") as MediaRef | null | undefined;
  const social = (branding.get("social") ?? {}) as Record<string, unknown>;
  const mode = branding.get("defaultTheme") === "dark" ? "dark" : "light";
  const name = str(store.get("displayName")) || str(branding.get("displayName")) || str(biz.get("name"));
  return {
    businessId,
    slug,
    name,
    description: str(store.get("description")) || str(branding.get("brandDescription")) || str(biz.get("description")),
    logo: logo?.mediaId ? { url: publicMediaUrl(businessId, logo.mediaId), alt: `${name} logo` } : null,
    currency: isCurrency(store.get("currency")) ? (store.get("currency") as string) : DEFAULT_CURRENCY,
    contactEmail: str(branding.get("contactEmail")),
    contactPhone: str(branding.get("contactPhone")),
    social: {
      instagram: str(social.instagram), facebook: str(social.facebook), x: str(social.x),
      tiktok: str(social.tiktok), website: str(social.website),
    },
    theme: {
      primary: hex(branding.get("primaryColor"), "#111827"),
      secondary: hex(branding.get("secondaryColor"), "#6B7280"),
      accent: hex(branding.get("accentColor"), "#2563EB"),
      background: hex(branding.get("backgroundColor"), mode === "dark" ? "#0B0F19" : "#FFFFFF"),
      mode,
    },
  };
});

function toCategory(businessId: string, id: string, d: DocumentData): PublicCategory {
  const img = d.image as MediaRef | null;
  return {
    id, name: d.name, slug: d.slug, description: str(d.description),
    image: img?.mediaId ? { url: publicMediaUrl(businessId, img.mediaId), alt: d.name } : null,
  };
}

/** Active categories in display order. Bounded by MAX_CATEGORIES. */
export const getPublicCategories = cache(async (businessId: string): Promise<PublicCategory[]> => {
  const snap = await adminDb()
    .collection(`businesses/${businessId}/categories`)
    .where("active", "==", true)
    .orderBy("sortOrder")
    .limit(MAX_CATEGORIES)
    .get();
  return snap.docs.map((d) => toCategory(businessId, d.id, d.data()));
});

export async function getPublicCategoryBySlug(store: PublicStore, categorySlug: string): Promise<PublicCategory | null> {
  if (!SLUG.test(categorySlug)) return null;
  const db = adminDb();
  const res = await db.doc(reservationPath(store.businessId, "category", categorySlug)).get();
  const id = res.get("refId");
  if (!res.exists || typeof id !== "string") return null;
  const snap = await db.doc(`businesses/${store.businessId}/categories/${id}`).get();
  if (!snap.exists || snap.get("active") !== true || snap.get("slug") !== categorySlug) return null;
  return toCategory(store.businessId, snap.id, snap.data()!);
}

function toProduct(store: PublicStore, id: string, d: DocumentData, cats: Map<string, PublicCategory>): PublicProduct {
  const cat = cats.get(d.categoryId);
  return {
    id, name: d.name, slug: d.slug, shortDescription: str(d.shortDescription), description: str(d.description),
    images: ((d.images as MediaRef[]) ?? []).map((m) => ({ url: publicMediaUrl(store.businessId, m.mediaId), alt: d.name })),
    priceCents: d.priceCents,
    compareAtPriceCents: typeof d.compareAtPriceCents === "number" ? d.compareAtPriceCents : null,
    currency: isCurrency(d.currency) ? d.currency : store.currency,
    sku: str(d.sku),
    inStock: d.availability !== "out_of_stock",
    featured: d.featured === true,
    categoryId: d.categoryId,
    categoryName: cat?.name ?? "",
    categorySlug: cat?.slug ?? "",
  };
}

export interface PublicProductQuery {
  categoryId?: string;
  featured?: boolean;
  sort?: ProductSort;
  dir?: "asc" | "desc";
  cursor?: string;
  limit?: number;
  excludeId?: string;
}

/**
 * Active products whose category is also active. Bounded: at most `limit` items per call and at most
 * MAX_ROUNDS Firestore reads; `nextCursor` resumes the scan. Products in inactive categories are skipped.
 */
export async function listPublicProducts(store: PublicStore, opts: PublicProductQuery = {}): Promise<Page<PublicProduct>> {
  const limit = Math.min(opts.limit ?? PAGE_SIZE, 48);
  const cats = new Map((await getPublicCategories(store.businessId)).map((c) => [c.id, c]));
  if (opts.categoryId && !cats.has(opts.categoryId)) return { items: [], nextCursor: null };

  const col = adminDb().collection(`businesses/${store.businessId}/products`);
  const plan = productQueryPlan({ status: "active", categoryId: opts.categoryId, featured: opts.featured, sort: opts.sort, dir: opts.dir });
  let base: Query = col.where("status", "==", "active");
  if (opts.categoryId) base = base.where("categoryId", "==", opts.categoryId);
  if (opts.featured !== undefined) base = base.where("featured", "==", opts.featured);
  base = base.orderBy(plan.orderBy, plan.dir);

  let after: QueryDocumentSnapshot | null = null;
  if (opts.cursor && ID.test(opts.cursor)) {
    const c = await col.doc(opts.cursor).get();
    if (c.exists) after = c as QueryDocumentSnapshot;
  }

  const MAX_ROUNDS = 4;
  const batchSize = limit * 2;
  const items: PublicProduct[] = [];
  let lastReturned: string | null = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const snap = await (after ? base.startAfter(after) : base).limit(batchSize).get();
    for (const d of snap.docs) {
      if (opts.excludeId === d.id || !cats.has(d.get("categoryId"))) {
        after = d;
        continue;
      }
      // A further visible product exists beyond this page: resume right after the last one we returned.
      if (items.length === limit) return { items, nextCursor: lastReturned };
      items.push(toProduct(store, d.id, d.data(), cats));
      lastReturned = d.id;
      after = d;
    }
    if (snap.size < batchSize) return { items, nextCursor: null }; // collection exhausted
  }
  // Scan budget used up without filling the page: resume after the last document examined.
  return { items, nextCursor: after?.id ?? null };
}

export async function getPublicProductBySlug(store: PublicStore, productSlug: string): Promise<PublicProduct | null> {
  if (!SLUG.test(productSlug)) return null;
  const db = adminDb();
  const res = await db.doc(reservationPath(store.businessId, "product", productSlug)).get();
  const id = res.get("refId");
  if (!res.exists || typeof id !== "string") return null;
  const snap = await db.doc(`businesses/${store.businessId}/products/${id}`).get();
  if (!snap.exists || snap.get("status") !== "active" || snap.get("slug") !== productSlug) return null;
  const cats = new Map((await getPublicCategories(store.businessId)).map((c) => [c.id, c]));
  if (!cats.has(snap.get("categoryId"))) return null; // category inactive/removed => product hidden
  return toProduct(store, snap.id, snap.data()!, cats);
}

/** Decides whether one media object may be shown to anonymous visitors. */
export async function getPublicMedia(businessId: string, mediaId: string): Promise<{ storagePath: string; contentType: string } | null> {
  const db = adminDb();
  const [biz, media, branding] = await db.getAll(
    db.doc(`businesses/${businessId}`),
    db.doc(`businesses/${businessId}/media/${mediaId}`),
    db.doc(`businesses/${businessId}/settings/branding`),
  );
  if (!biz.exists || biz.get("deletedAt") || biz.get("storeStatus") !== "published") return null;
  if (!media.exists || media.get("deletedAt") || media.get("businessId") !== businessId) return null;

  const ownerType = media.get("ownerType") as string | null | undefined;
  const ownerId = media.get("ownerId") as string | null | undefined;
  let allowed = false;
  const logo = branding.get("logo") as MediaRef | null | undefined;
  if (logo?.mediaId === mediaId) {
    allowed = true; // the branding logo is public regardless of how it was attached
  } else if (ownerType === "category" && ownerId) {
    const c = await db.doc(`businesses/${businessId}/categories/${ownerId}`).get();
    allowed = c.exists && c.get("active") === true && (c.get("image") as MediaRef | null)?.mediaId === mediaId;
  } else if (ownerType === "product" && ownerId) {
    const p = await db.doc(`businesses/${businessId}/products/${ownerId}`).get();
    if (p.exists && p.get("status") === "active" && ((p.get("images") as MediaRef[]) ?? []).some((m) => m.mediaId === mediaId)) {
      const c = await db.doc(`businesses/${businessId}/categories/${p.get("categoryId")}`).get();
      allowed = c.exists && c.get("active") === true;
    }
  }
  return allowed ? { storagePath: media.get("storagePath"), contentType: media.get("contentType") } : null;
}
