import "server-only";
import { randomBytes } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { AuthError } from "@/lib/auth/errors";
import { slugCandidate, slugify, isValidSlug } from "@/lib/utils/slug";

export type SlugKind = "category" | "product";

export const reservationPath = (businessId: string, kind: SlugKind, slug: string) =>
  `businesses/${businessId}/slugReservations/${kind}__${slug}`;

/**
 * Chooses a slug that is unique WITHIN the business, reserving it via a server-only
 * `slugReservations/{kind}__{slug}` document (the same pattern as the global `slugs` registry).
 * Must run inside the transaction that creates/renames the record; reads happen here, the caller
 * performs the writes with `reserve`.
 *  - explicit slug taken by another record -> slug_taken (field error)
 *  - derived slug taken -> name, name-2, name-3 ... then a random suffix
 */
export async function chooseSlug(
  db: Firestore,
  tx: Transaction,
  businessId: string,
  kind: SlugKind,
  opts: { explicit: string; name: string; selfId: string },
): Promise<string> {
  const free = (snap: { exists: boolean; get(f: string): unknown }) => !snap.exists || snap.get("refId") === opts.selfId;

  if (opts.explicit) {
    const snap = await tx.get(db.doc(reservationPath(businessId, kind, opts.explicit)));
    if (!free(snap)) throw new AuthError("slug_taken", "That URL name is already used in this business.", { fieldErrors: { slug: ["Already in use"] } });
    return opts.explicit;
  }
  const base = slugify(opts.name) || kind;
  const candidates = Array.from({ length: 8 }, (_, i) => slugCandidate(base, i + 1)).filter(isValidSlug);
  const snaps = await tx.getAll(...candidates.map((c) => db.doc(reservationPath(businessId, kind, c))));
  const hit = candidates.find((_, i) => free(snaps[i]));
  if (hit) return hit;
  return `${base.slice(0, 40)}-${randomBytes(3).toString("hex")}`;
}

export function reserve(db: Firestore, tx: Transaction, businessId: string, kind: SlugKind, slug: string, refId: string) {
  tx.set(db.doc(reservationPath(businessId, kind, slug)), { refId, kind, createdAt: new Date() });
}
export function release(db: Firestore, tx: Transaction, businessId: string, kind: SlugKind, slug: string) {
  tx.delete(db.doc(reservationPath(businessId, kind, slug)));
}
