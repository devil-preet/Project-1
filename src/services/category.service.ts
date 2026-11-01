import "server-only";
import { FieldValue, type DocumentData, type Query } from "firebase-admin/firestore";
import { AuthError } from "@/lib/auth/errors";
import { adminDb } from "@/lib/firebase/admin";
import { iso } from "@/lib/firebase/firestore";
import { categoryQueryPlan, normalizeSearch } from "@/lib/catalog/query-plan";
import type { CategoryDTO } from "@/lib/catalog/types";
import { MAX_CATEGORIES, PAGE_SIZE, type CategoryInput } from "@/lib/validations/catalog";
import type { MediaRef, Page } from "@/types";
import { chooseSlug, release, reserve } from "./catalog.shared";
import { adminMediaUrl, loadMediaForOwner, releaseMedia } from "./media.service";

const col = (businessId: string) => adminDb().collection(`businesses/${businessId}/categories`);

export function categoryDTO(businessId: string, id: string, d: DocumentData): CategoryDTO {
  const img = d.image as MediaRef | null;
  return {
    id,
    name: d.name,
    slug: d.slug,
    description: d.description ?? "",
    image: img ? { mediaId: img.mediaId, alt: img.alt, url: adminMediaUrl(businessId, img.mediaId) } : null,
    active: d.active === true,
    sortOrder: d.sortOrder ?? 0,
    productCount: d.productCount ?? 0,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

/** Admin list. Bounded (<= MAX_CATEGORIES) and paginated; `q` is a case-insensitive name prefix. */
export async function listCategories(
  businessId: string,
  opts: { q?: string; cursor?: string; limit?: number } = {},
): Promise<Page<CategoryDTO>> {
  const plan = categoryQueryPlan({ q: opts.q });
  const limit = Math.min(opts.limit ?? PAGE_SIZE, MAX_CATEGORIES);
  let q: Query = col(businessId);
  if (plan.prefix) {
    const p = normalizeSearch(opts.q);
    q = q.where("searchName", ">=", p).where("searchName", "<", p + "");
  }
  q = q.orderBy(plan.orderBy, plan.dir);
  if (opts.cursor) {
    const c = await col(businessId).doc(opts.cursor).get();
    if (c.exists) q = q.startAfter(c);
  }
  const snap = await q.limit(limit + 1).get();
  const docs = snap.docs.slice(0, limit);
  return {
    items: docs.map((d) => categoryDTO(businessId, d.id, d.data())),
    nextCursor: snap.docs.length > limit ? docs[docs.length - 1].id : null,
  };
}

/** All categories (id, name, active) for pickers and joins. Bounded by MAX_CATEGORIES. */
export async function listCategoryOptions(businessId: string): Promise<{ id: string; name: string; active: boolean }[]> {
  const snap = await col(businessId).orderBy("sortOrder").limit(MAX_CATEGORIES).get();
  return snap.docs.map((d) => ({ id: d.id, name: d.get("name") as string, active: d.get("active") === true }));
}

export async function createCategory(businessId: string, input: CategoryInput): Promise<CategoryDTO> {
  const db = adminDb();
  const [count, last] = await Promise.all([
    col(businessId).count().get(),
    col(businessId).orderBy("sortOrder", "desc").limit(1).get(),
  ]);
  if (count.data().count >= MAX_CATEGORIES) {
    throw new AuthError("limit_reached", `A business can have at most ${MAX_CATEGORIES} categories.`);
  }
  const sortOrder = ((last.docs[0]?.get("sortOrder") as number | undefined) ?? -1) + 1;
  const ref = col(businessId).doc();

  const result = await db.runTransaction(async (tx) => {
    const media = await loadMediaForOwner(db, tx, businessId, input.imageId ? [input.imageId] : [], { type: "category", id: ref.id }, input.name);
    const slug = await chooseSlug(db, tx, businessId, "category", { explicit: input.slug, name: input.name, selfId: ref.id });
    const now = FieldValue.serverTimestamp();
    const image = media.refs[0] ?? null;
    tx.create(ref, {
      businessId,
      name: input.name,
      slug,
      description: input.description,
      image,
      active: input.active,
      sortOrder,
      productCount: 0,
      searchName: input.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    });
    reserve(db, tx, businessId, "category", slug, ref.id);
    media.claim();
    return { slug, image };
  });
  return categoryDTO(businessId, ref.id, {
    name: input.name, slug: result.slug, description: input.description, image: result.image,
    active: input.active, sortOrder, productCount: 0,
  });
}

export async function updateCategory(businessId: string, id: string, input: CategoryInput): Promise<CategoryDTO> {
  const db = adminDb();
  const ref = col(businessId).doc(id);
  let removed: MediaRef | null = null;

  const next = await db.runTransaction(async (tx) => {
    removed = null;
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AuthError("not_found");
    const cur = snap.data() as DocumentData;
    const curImage = cur.image as MediaRef | null;
    const wantId = input.imageId;
    const keep = !!curImage && curImage.mediaId === wantId;
    const media = await loadMediaForOwner(db, tx, businessId, wantId && !keep ? [wantId] : [], { type: "category", id }, input.name);
    const slug = input.slug && input.slug !== cur.slug
      ? await chooseSlug(db, tx, businessId, "category", { explicit: input.slug, name: input.name, selfId: id })
      : (cur.slug as string);

    const image = keep ? curImage : (media.refs[0] ?? null);
    if (curImage && !keep) removed = curImage;
    tx.update(ref, {
      name: input.name, slug, description: input.description, image, active: input.active,
      searchName: input.name.toLowerCase(), updatedAt: FieldValue.serverTimestamp(),
    });
    if (slug !== cur.slug) {
      release(db, tx, businessId, "category", cur.slug);
      reserve(db, tx, businessId, "category", slug, id);
    }
    media.claim();
    return { ...cur, name: input.name, slug, description: input.description, image, active: input.active };
  });
  if (removed) await releaseMedia(db, businessId, [removed]);
  return categoryDTO(businessId, id, next);
}

export async function setCategoryActive(businessId: string, id: string, active: boolean): Promise<void> {
  const ref = col(businessId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AuthError("not_found");
  await ref.update({ active, updatedAt: FieldValue.serverTimestamp() });
}

/** Refuses while products are assigned (productCount is maintained in the same transactions as product writes). */
export async function deleteCategory(businessId: string, id: string): Promise<void> {
  const db = adminDb();
  const ref = col(businessId).doc(id);
  let image: MediaRef | null = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AuthError("not_found");
    const n = (snap.get("productCount") as number) ?? 0;
    if (n > 0) {
      throw new AuthError("conflict", `This category still has ${n} product${n === 1 ? "" : "s"}. Move or delete them first.`);
    }
    image = (snap.get("image") as MediaRef | null) ?? null;
    tx.delete(ref);
    release(db, tx, businessId, "category", snap.get("slug") as string);
  });
  if (image) await releaseMedia(db, businessId, [image]);
}

/** Swaps a category with its neighbour and renumbers sortOrder densely (bounded batch). */
export async function moveCategory(businessId: string, id: string, direction: "up" | "down"): Promise<void> {
  const db = adminDb();
  const snap = await col(businessId).orderBy("sortOrder").limit(MAX_CATEGORIES).get();
  const ids = snap.docs.map((d) => d.id);
  const i = ids.indexOf(id);
  if (i < 0) throw new AuthError("not_found");
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const batch = db.batch();
  const before = new Map(snap.docs.map((d) => [d.id, d.get("sortOrder") as number]));
  ids.forEach((cid, idx) => {
    if (before.get(cid) !== idx) batch.update(col(businessId).doc(cid), { sortOrder: idx, updatedAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();
}
