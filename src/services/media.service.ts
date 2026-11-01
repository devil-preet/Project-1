import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { AuthError } from "@/lib/auth/errors";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { MEDIA_MAX_BYTES } from "@/lib/validations/catalog";
import type { MediaRef } from "@/types";
import { sniffImage } from "./onboarding.service";

export type MediaOwnerType = "product" | "category" | "branding";

export const adminMediaUrl = (businessId: string, mediaId: string) => `/api/b/${businessId}/media/${mediaId}`;
export const publicMediaUrl = (businessId: string, mediaId: string) => `/api/public/media/${businessId}/${mediaId}`;

const safeName = (n: string, fallback: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || fallback;

/**
 * Stores one image for a business. Type comes from the file's magic bytes (the declared type is
 * ignored), the object name is a fresh UUID and `ifGenerationMatch: 0` makes overwrites impossible.
 * The media document starts UNATTACHED (ownerType null); it only becomes public/served-to-customers
 * once a product, category or the branding claims it (see attachMedia).
 */
export async function uploadMedia(businessId: string, uid: string, bytes: Buffer, fileName: string) {
  if (bytes.length === 0) throw new AuthError("invalid_input", "That file is empty.");
  if (bytes.length > MEDIA_MAX_BYTES) throw new AuthError("invalid_input", "Images must be 8 MB or smaller.");
  const kind = sniffImage(bytes);
  if (!kind) throw new AuthError("invalid_input", "Use a PNG, JPEG or WebP image.");

  const mediaId = randomUUID();
  const storagePath = `businesses/${businessId}/media/${mediaId}.${kind.ext}`;
  await adminBucket().file(storagePath).save(bytes, {
    contentType: kind.contentType,
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  });
  try {
    await adminDb().doc(`businesses/${businessId}/media/${mediaId}`).create({
      businessId,
      storagePath,
      url: "",
      contentType: kind.contentType,
      sizeBytes: bytes.length,
      fileName: safeName(fileName, `image.${kind.ext}`),
      uploadedBy: uid,
      ownerType: null,
      ownerId: null,
      deletedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    await adminBucket().file(storagePath).delete({ ignoreNotFound: true }).catch(() => undefined);
    throw e;
  }
  return { mediaId, fileName: safeName(fileName, `image.${kind.ext}`), sizeBytes: bytes.length, contentType: kind.contentType };
}

/**
 * Inside a transaction: verifies every media id belongs to THIS business, is not deleted and is either
 * unattached or already owned by this same owner, then claims it. Returns refs in the given order.
 * Reads must happen before writes, so callers invoke this before their own tx writes.
 */
export async function loadMediaForOwner(
  db: Firestore,
  tx: Transaction,
  businessId: string,
  ids: string[],
  owner: { type: MediaOwnerType; id: string },
  alt: string,
): Promise<{ refs: MediaRef[]; claim: () => void }> {
  if (ids.length === 0) return { refs: [], claim: () => undefined };
  const snaps = await tx.getAll(...ids.map((id) => db.doc(`businesses/${businessId}/media/${id}`)));
  const refs: MediaRef[] = [];
  snaps.forEach((s, i) => {
    const d = s.data();
    const foreign = d && d.ownerType && (d.ownerType !== owner.type || d.ownerId !== owner.id);
    if (!d || d.businessId !== businessId || d.deletedAt || foreign) {
      throw new AuthError("invalid_input", "One of the images is no longer available. Remove it and upload again.", {
        fieldErrors: { imageIds: ["Image unavailable"] },
      });
    }
    refs.push({ mediaId: ids[i], url: "", storagePath: d.storagePath as string, alt });
  });
  return {
    refs,
    claim: () =>
      snaps.forEach((s) => {
        if (!s.get("ownerType")) tx.update(s.ref, { ownerType: owner.type, ownerId: owner.id, updatedAt: FieldValue.serverTimestamp() });
      }),
  };
}

/** Marks media deleted and removes the Storage object — only for assets the caller has just verified are theirs. */
export async function releaseMedia(db: Firestore, businessId: string, refs: { mediaId: string; storagePath: string }[]) {
  await Promise.all(
    refs.map(async (r) => {
      if (!r.storagePath.startsWith(`businesses/${businessId}/media/`)) return; // never touch foreign paths
      await db.doc(`businesses/${businessId}/media/${r.mediaId}`).update({ deletedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
      await adminBucket().file(r.storagePath).delete({ ignoreNotFound: true }).catch(() => undefined);
    }),
  );
}

export async function readMediaObject(storagePath: string): Promise<Buffer> {
  const [buf] = await adminBucket().file(storagePath).download();
  return buf;
}
