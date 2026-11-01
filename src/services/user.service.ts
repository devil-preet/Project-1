import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Creates users/{uid} if (and only if) it does not exist. Idempotent, so it is
 * safe to call from both registration and login: if registration died after the
 * Auth account was created but before the profile was written, the next login
 * self-heals.
 */
export async function ensureUserProfile(input: {
  uid: string;
  email: string;
  fullName: string;
  photoURL?: string | null;
}): Promise<{ created: boolean }> {
  const ref = adminDb().doc(`users/${input.uid}`);
  return adminDb().runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return { created: false };
    tx.create(ref, {
      uid: input.uid,
      email: input.email,
      fullName: input.fullName,
      photoURL: input.photoURL ?? null,
      lastBusinessId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { created: true };
  });
}
