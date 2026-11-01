import { DEFAULT_CURRENCY } from "@/lib/utils/money";
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { iso } from "@/lib/firebase/firestore";
import { AuthError } from "@/lib/auth/errors";
import { isValidSlug, RESERVED_SLUGS, slugCandidate, slugify } from "@/lib/utils/slug";
import { LOGO_MAX_BYTES, type DraftData, type OnboardingInput } from "@/lib/validations/onboarding";
import type { DraftLogo, OnboardingDraft, OnboardingStatus } from "@/types";
import { listMemberships } from "./business.service";

/** Abuse guard: businesses a single account may OWN. */
export const MAX_OWNED_BUSINESSES = 5;
const MAX_SLUG_ATTEMPTS = 12;

const draftPath = (uid: string) => `users/${uid}/onboarding/current`;

function toDraft(data: FirebaseFirestore.DocumentData): OnboardingDraft {
  return {
    status: data.status,
    businessId: data.businessId,
    step: data.step ?? 1,
    data: data.data ?? {},
    logo: data.logo ?? null,
    completedBusinessId: data.completedBusinessId ?? null,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

export async function getOnboardingState(
  uid: string,
): Promise<{ status: OnboardingStatus; draft: OnboardingDraft | null }> {
  const snap = await adminDb().doc(draftPath(uid)).get();
  if (!snap.exists) return { status: "NOT_STARTED", draft: null };
  const draft = toDraft(snap.data()!);
  return { status: draft.status, draft };
}

/**
 * Returns the user's resumable draft, creating one if needed. The draft holds a
 * server-reserved businessId (a fresh Firestore auto-id): that id is what makes
 * creation idempotent — however many times "create" is submitted, it can only
 * ever produce THIS business. `fresh` starts a new draft once the previous one
 * is COMPLETED (a deliberate second business); an unfinished draft is resumed.
 */
export async function ensureDraft(uid: string, opts: { fresh?: boolean } = {}): Promise<OnboardingDraft> {
  const db = adminDb();
  const ref = db.doc(draftPath(uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const needsNew = !snap.exists || (opts.fresh && snap.get("status") === "COMPLETED");
    if (!needsNew) return toDraft(snap.data()!);
    const fresh = {
      status: "IN_PROGRESS",
      businessId: db.collection("businesses").doc().id,
      step: 1,
      data: {},
      logo: null,
      completedBusinessId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, fresh);
    return toDraft({ ...fresh, createdAt: null, updatedAt: null });
  });
}

export async function saveDraft(
  uid: string,
  input: { step: number; data: DraftData; fresh?: boolean; removeLogo?: boolean },
): Promise<OnboardingDraft> {
  const initial = await ensureDraft(uid, { fresh: input.fresh });
  if (initial.status === "COMPLETED") throw new AuthError("forbidden");

  const db = adminDb();
  const ref = db.doc(draftPath(uid));
  const removed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("status") !== "IN_PROGRESS") throw new AuthError("forbidden");
    const merged = { ...(snap.get("data") ?? {}), ...input.data };
    const update: Record<string, unknown> = { step: input.step, data: merged, updatedAt: FieldValue.serverTimestamp() };
    let oldLogo: DraftLogo | null = null;
    if (input.removeLogo && snap.get("logo")) {
      oldLogo = snap.get("logo");
      update.logo = null;
    }
    tx.update(ref, update);
    return oldLogo;
  });
  if (removed) await deleteObjectQuietly(removed.storagePath);
  return (await getOnboardingState(uid)).draft!;
}

/* ------------------------------------------------------------------ logo */

/** Detects the real image type from magic bytes; the client-declared type is never trusted. */
export function sniffImage(buf: Buffer): { contentType: string; ext: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: "image/png", ext: "png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { contentType: "image/webp", ext: "webp" };
  }
  return null;
}

function publicUrl(path: string): string {
  const emu = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const base = emu ? `http://${emu}` : "https://firebasestorage.googleapis.com";
  return `${base}/v0/b/${adminBucket().name}/o/${encodeURIComponent(path)}?alt=media`;
}

async function deleteObjectQuietly(path: string) {
  await adminBucket().file(path).delete({ ignoreNotFound: true }).catch(() => undefined);
}

/**
 * Stores the logo under the reserved business's media folder (businesses/{id}/media/),
 * the only place Storage rules allow. The media document is created later, inside the
 * business transaction, so an abandoned upload leaves no Firestore trace.
 */
export async function attachLogo(uid: string, bytes: Buffer, fileName: string): Promise<DraftLogo> {
  if (bytes.length === 0) throw new AuthError("invalid_input", "That file is empty.");
  if (bytes.length > LOGO_MAX_BYTES) throw new AuthError("invalid_input", "Logo must be 2 MB or smaller.");
  const kind = sniffImage(bytes);
  if (!kind) throw new AuthError("invalid_input", "Logo must be a PNG, JPEG or WebP image.");

  const draft = await ensureDraft(uid);
  if (draft.status !== "IN_PROGRESS") throw new AuthError("forbidden");

  const mediaId = randomUUID();
  const storagePath = `businesses/${draft.businessId}/media/${mediaId}.${kind.ext}`;
  await adminBucket().file(storagePath).save(bytes, {
    contentType: kind.contentType,
    resumable: false,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  });

  const logo: DraftLogo = {
    mediaId,
    storagePath,
    url: publicUrl(storagePath),
    contentType: kind.contentType,
    sizeBytes: bytes.length,
    fileName: fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `logo.${kind.ext}`,
  };

  const db = adminDb();
  const ref = db.doc(draftPath(uid));
  const previous = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("status") !== "IN_PROGRESS" || snap.get("businessId") !== draft.businessId) {
      throw new AuthError("forbidden");
    }
    tx.update(ref, { logo, updatedAt: FieldValue.serverTimestamp() });
    return (snap.get("logo") as DraftLogo | null) ?? null;
  }).catch(async (e) => {
    await deleteObjectQuietly(storagePath); // don't orphan the new object
    throw e;
  });
  if (previous) await deleteObjectQuietly(previous.storagePath);
  return logo;
}

/* ------------------------------------------------------------------ slugs */

export type SlugCheck =
  | { available: true }
  | { available: false; reason: "invalid" | "reserved" | "taken"; suggestion?: string };

/** Advisory only — the transaction in completeOnboarding is the authority. */
export async function checkSlug(slug: string): Promise<SlugCheck> {
  if (RESERVED_SLUGS.has(slug)) return { available: false, reason: "reserved" };
  if (!isValidSlug(slug)) return { available: false, reason: "invalid" };
  const db = adminDb();
  if (!(await db.doc(`slugs/${slug}`).get()).exists) return { available: true };

  const candidates = [2, 3, 4, 5, 6].map((n) => slugCandidate(slug, n)).filter(isValidSlug);
  const snaps = await db.getAll(...candidates.map((c) => db.doc(`slugs/${c}`)));
  const free = candidates.find((_, i) => !snaps[i].exists);
  return { available: false, reason: "taken", suggestion: free };
}

/* --------------------------------------------------------------- creation */

export interface CreatedBusiness {
  businessId: string;
  /** false when the request was a repeat and nothing new was written. */
  created: boolean;
  slug?: string;
}

export async function completeOnboarding(
  user: { uid: string; email: string; name: string | null },
  input: OnboardingInput,
): Promise<CreatedBusiness> {
  const draft = await ensureDraft(user.uid);
  if (draft.status === "COMPLETED") {
    // Repeat / refresh / double-click: hand back the business this draft already produced.
    return { businessId: draft.completedBusinessId!, created: false };
  }

  const owned = (await listMemberships(user.uid)).filter((m) => m.role === "OWNER").length;
  if (owned >= MAX_OWNED_BUSINESSES) throw new AuthError("limit_reached");

  // The logo must really exist in Storage; otherwise drop it rather than fail creation.
  let logo = draft.logo;
  if (logo) {
    const [exists] = await adminBucket().file(logo.storagePath).exists().catch(() => [false] as const);
    if (!exists) logo = null;
  }

  const explicit = input.slug !== "";
  const base = explicit ? input.slug : slugify(input.storeDisplayName) || slugify(input.businessName) || "store";
  const db = adminDb();

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS + 1; attempt++) {
    const slug = explicit
      ? base
      : attempt <= MAX_SLUG_ATTEMPTS
        ? slugCandidate(base, attempt)
        : `${base.slice(0, 40)}-${randomBytes(3).toString("hex")}`;
    if (!isValidSlug(slug)) {
      if (explicit) throw new AuthError("invalid_input", undefined, { fieldErrors: { slug: ["Choose a different store address."] } });
      continue; // e.g. a derived slug that is reserved: try the next candidate
    }
    try {
      return await createBusinessTx(db, user, draft, input, slug, logo);
    } catch (e) {
      if (e instanceof AuthError && e.code === "slug_taken" && !explicit) continue;
      throw e;
    }
  }
  throw new AuthError("slug_taken");
}

/**
 * THE tenant-creation transaction. Everything below commits atomically or not at all:
 *   slugs/{slug}                      reservation (create-only: a taken slug aborts the whole tx)
 *   businesses/{id}                   id = the draft's reserved id (idempotency anchor)
 *   businesses/{id}/members/{uid}     role OWNER — the ONLY place OWNER is ever assigned
 *   businesses/{id}/settings/store    defaults
 *   businesses/{id}/settings/branding defaults
 *   businesses/{id}/media/{mediaId}   logo metadata (only if a logo was uploaded)
 *   users/{uid}.lastBusinessId        default workspace
 *   users/{uid}/onboarding/current    status → COMPLETED (resume/idempotency record)
 * All writes use create() (never overwrite), so a collision anywhere rolls everything back.
 */
async function createBusinessTx(
  db: Firestore,
  user: { uid: string; email: string; name: string | null },
  draft: OnboardingDraft,
  input: OnboardingInput,
  slug: string,
  logo: DraftLogo | null,
): Promise<CreatedBusiness> {
  const businessId = draft.businessId;
  const dRef = db.doc(draftPath(user.uid));
  const bRef = db.doc(`businesses/${businessId}`);
  const sRef = db.doc(`slugs/${slug}`);
  const uRef = db.doc(`users/${user.uid}`);

  return db.runTransaction(async (tx) => {
    const [dSnap, bSnap, sSnap] = await tx.getAll(dRef, bRef, sRef);

    // The draft must still be the one we were called with, and still ours.
    if (!dSnap.exists || dSnap.get("businessId") !== businessId) throw new AuthError("forbidden");
    if (dSnap.get("status") === "COMPLETED") {
      return { businessId: dSnap.get("completedBusinessId") as string, created: false };
    }
    if (bSnap.exists) {
      // A concurrent identical request already created it.
      if (bSnap.get("ownerId") !== user.uid) throw new AuthError("forbidden");
      tx.update(dRef, { status: "COMPLETED", completedBusinessId: businessId, updatedAt: FieldValue.serverTimestamp() });
      return { businessId, created: false, slug: bSnap.get("slug") as string };
    }
    if (sSnap.exists) {
      throw new AuthError("slug_taken", undefined, { fieldErrors: { slug: ["That store address is already taken."] } });
    }

    const now = FieldValue.serverTimestamp();
    const logoRef = logo
      ? { mediaId: logo.mediaId, url: logo.url, storagePath: logo.storagePath, alt: `${input.storeDisplayName} logo` }
      : null;

    tx.create(sRef, { businessId, type: "primary", createdAt: now });

    tx.create(bRef, {
      name: input.businessName,
      slug,
      industry: input.industry,
      description: input.description,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      ownerId: user.uid,
      storeStatus: input.storeStatus,
      onboarding: { status: "COMPLETED", completedAt: now, version: 1 },
      customDomain: null,
      subdomain: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    tx.create(db.doc(`businesses/${businessId}/members/${user.uid}`), {
      uid: user.uid,
      businessId,
      role: "OWNER",
      email: user.email,
      fullName: user.name ?? user.email.split("@")[0],
      invitedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    tx.create(db.doc(`businesses/${businessId}/settings/store`), {
      displayName: input.storeDisplayName,
      description: input.storeDescription,
      currency: DEFAULT_CURRENCY, // changeable in Settings until the first product exists
      status: input.storeStatus,
      publicVisibility: input.storeStatus === "published",
      createdAt: now,
      updatedAt: now,
    });

    tx.create(db.doc(`businesses/${businessId}/settings/branding`), {
      displayName: input.storeDisplayName,
      defaultTheme: input.defaultTheme,
      logo: logoRef,
      favicon: null,
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      accentColor: input.accentColor,
      backgroundColor: input.defaultTheme === "dark" ? "#0B0F19" : "#FFFFFF",
      brandDescription: input.storeDescription || input.description,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      social: { instagram: "", facebook: "", x: "", tiktok: "", website: "" },
      createdAt: now,
      updatedAt: now,
    });

    if (logo) {
      tx.create(db.doc(`businesses/${businessId}/media/${logo.mediaId}`), {
        businessId,
        storagePath: logo.storagePath,
        url: logo.url,
        contentType: logo.contentType,
        sizeBytes: logo.sizeBytes,
        fileName: logo.fileName,
        uploadedBy: user.uid,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    tx.set(uRef, { lastBusinessId: businessId, updatedAt: now }, { merge: true });
    tx.update(dRef, {
      status: "COMPLETED",
      completedBusinessId: businessId,
      step: 4,
      data: input,
      updatedAt: now,
    });

    return { businessId, created: true, slug };
  });
}
