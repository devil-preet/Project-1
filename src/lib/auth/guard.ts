import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { can, type Permission } from "@/lib/permissions";
import { ROLES, type Role } from "@/types";
import { AuthError } from "./errors";
import { requireVerifiedSession, type Session } from "./session";

export interface BusinessAccess {
  session: Session;
  businessId: string;
  role: Role;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Core authorization decision, independent of how the session was obtained
 * (so it is unit-testable). Every failure mode — malformed id, unknown
 * business, deleted business, non-member, insufficient role — surfaces as the
 * same `forbidden` error so a caller cannot probe which businesses exist.
 *
 * The businessId is NEVER trusted: access is derived solely from the
 * `members/{uid}` document written by trusted server code.
 */
export async function authorizeMember(
  db: Firestore,
  uid: string,
  businessId: string,
  permission: Permission,
): Promise<Role> {
  if (!ID_PATTERN.test(businessId)) throw new AuthError("forbidden");

  const [memberSnap, businessSnap] = await db.getAll(
    db.doc(`businesses/${businessId}/members/${uid}`),
    db.doc(`businesses/${businessId}`),
  );
  if (!memberSnap.exists || !businessSnap.exists) throw new AuthError("forbidden");
  if (businessSnap.get("deletedAt")) throw new AuthError("forbidden");

  const role = memberSnap.get("role") as Role;
  if (!ROLES.includes(role) || !can(role, permission)) throw new AuthError("forbidden");
  return role;
}

/**
 * Entry point for every tenant-scoped server action / route handler:
 * session → verified email → membership → role permission.
 */
export async function requireBusinessAccess(
  businessId: string,
  permission: Permission,
): Promise<BusinessAccess> {
  const session = await requireVerifiedSession();
  const role = await authorizeMember(adminDb(), session.uid, businessId, permission);
  return { session, businessId, role };
}
