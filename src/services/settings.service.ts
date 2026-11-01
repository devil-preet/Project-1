import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { AuthError } from "@/lib/auth/errors";
import { adminDb } from "@/lib/firebase/admin";
import type { SettingsAction } from "@/lib/validations/catalog";
import type { MediaRef } from "@/types";
import { loadMediaForOwner } from "./media.service";

type Input<K extends SettingsAction["action"]> = Extract<SettingsAction, { action: K }>;

/** Store identity + currency. Currency is locked once products exist (prices are stored in minor units of it). */
export async function updateStoreSettings(businessId: string, input: Input<"store">): Promise<void> {
  const db = adminDb();
  const count = await db.collection(`businesses/${businessId}/products`).count().get();
  const storeRef = db.doc(`businesses/${businessId}/settings/store`);
  const cur = await storeRef.get();
  if (cur.get("currency") !== input.currency && count.data().count > 0) {
    throw new AuthError("conflict", "Currency cannot be changed after products have been added.", {
      fieldErrors: { currency: ["Locked while products exist"] },
    });
  }
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(storeRef, { displayName: input.displayName, description: input.description, currency: input.currency, updatedAt: now }, { merge: true });
  batch.set(db.doc(`businesses/${businessId}/settings/branding`), { displayName: input.displayName, updatedAt: now }, { merge: true });
  await batch.commit();
}

/** The single switch that makes the public storefront visible. */
export async function setStorePublished(businessId: string, published: boolean): Promise<void> {
  const db = adminDb();
  const status = published ? "published" : "unpublished";
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.update(db.doc(`businesses/${businessId}`), { storeStatus: status, updatedAt: now });
  batch.set(db.doc(`businesses/${businessId}/settings/store`), { status, publicVisibility: published, updatedAt: now }, { merge: true });
  await batch.commit();
}

export async function updateBranding(businessId: string, input: Input<"branding">): Promise<void> {
  const db = adminDb();
  const ref = db.doc(`businesses/${businessId}/settings/branding`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.get("logo") as MediaRef | null | undefined;
    const keep = !!cur && cur.mediaId === input.logoId;
    const media = await loadMediaForOwner(db, tx, businessId, input.logoId && !keep ? [input.logoId] : [], { type: "branding", id: "logo" }, "Logo");
    const name = (snap.get("displayName") as string) ?? "Store";
    const logo = keep ? cur : media.refs[0] ? { ...media.refs[0], alt: `${name} logo` } : null;
    tx.set(
      ref,
      {
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        accentColor: input.accentColor,
        defaultTheme: input.defaultTheme,
        backgroundColor: input.defaultTheme === "dark" ? "#0B0F19" : "#FFFFFF",
        logo,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    media.claim();
  });
}
