import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ROLES, type Membership, type Role } from "@/types";

/**
 * Every business the user belongs to, with their role in each. Source of truth is
 * the `members/{uid}` documents (collection-group query on `uid`); there is no
 * denormalized list on the user, so it can never drift from real access.
 * Soft-deleted and missing businesses are omitted. Sorted by name.
 */
export async function listMemberships(uid: string): Promise<Membership[]> {
  const db = adminDb();
  const snap = await db.collectionGroup("members").where("uid", "==", uid).get();

  const raw = snap.docs
    .map((d) => ({
      businessId: d.ref.parent.parent?.id ?? "",
      role: d.get("role") as Role,
      isBusiness: d.ref.parent.parent?.parent.id === "businesses",
    }))
    .filter((m) => m.businessId && m.isBusiness && ROLES.includes(m.role));
  if (raw.length === 0) return [];

  const businesses = await db.getAll(...raw.map((m) => db.doc(`businesses/${m.businessId}`)));
  const out: Membership[] = [];
  raw.forEach((m, i) => {
    const b = businesses[i];
    if (!b.exists || b.get("deletedAt")) return;
    out.push({
      businessId: m.businessId,
      role: m.role,
      business: {
        id: b.id,
        name: String(b.get("name") ?? ""),
        slug: String(b.get("slug") ?? ""),
        storeStatus: b.get("storeStatus") === "published" ? "published" : "unpublished",
        industry: String(b.get("industry") ?? ""),
      },
    });
  });
  return out.sort((a, b) => a.business.name.localeCompare(b.business.name));
}

export async function getLastBusinessId(uid: string): Promise<string | null> {
  const snap = await adminDb().doc(`users/${uid}`).get();
  const v = snap.get("lastBusinessId");
  return typeof v === "string" ? v : null;
}

export interface ActiveBusiness {
  active: Membership;
  /** The caller asked for a business they do not belong to (ignored, never confirmed to exist). */
  requestedDenied: boolean;
}

/**
 * Chooses the workspace to show. A requested id (e.g. `?b=`) is honoured ONLY if it
 * matches one of the caller's verified memberships; otherwise we fall back to the
 * last-used business, then the first membership. Pure: no I/O, no writes on read.
 */
export function pickActiveBusiness(
  memberships: Membership[],
  requestedId: string | null | undefined,
  lastBusinessId: string | null,
): ActiveBusiness | null {
  if (memberships.length === 0) return null;
  const byId = (id: string | null | undefined) => memberships.find((m) => m.businessId === id);
  const requested = requestedId ? byId(requestedId) : undefined;
  if (requested) return { active: requested, requestedDenied: false };
  return {
    active: byId(lastBusinessId) ?? memberships[0],
    requestedDenied: !!requestedId,
  };
}
