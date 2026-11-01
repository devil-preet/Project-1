import "server-only";
import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Credential resolution order:
 *  1. Emulators (FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST set):
 *     no credential — nothing can reach production by construction.
 *  2. FIREBASE_SERVICE_ACCOUNT_JSON (base64 or raw JSON) — discouraged fallback.
 *  3. Application Default Credentials — automatic on App Hosting / Cloud Run,
 *     `gcloud auth application-default login` locally.
 */
/** Parses raw or base64 service-account JSON. Error text never includes the value. */
function parseServiceAccount(raw: string): ServiceAccount {
  const trimmed = raw.trim();
  try {
    const json = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
    return JSON.parse(json) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is malformed: expected service-account JSON, raw or base64-encoded.");
  }
}

function createApp(): App {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  // Needed only to sign custom tokens when running with user ADC (see auth.service).
  const serviceAccountId = process.env.FIREBASE_AUTH_SERVICE_ACCOUNT_ID || undefined;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId, storageBucket });
  }
  if (raw?.trim()) {
    return initializeApp({ credential: cert(parseServiceAccount(raw)), projectId, storageBucket });
  }
  // Vercel has no Application Default Credentials; falling through would only fail later with an
  // opaque "Could not load the default credentials" from deep inside google-gax.
  if (process.env.VERCEL) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set (required on Vercel: raw or base64 service-account JSON).");
  }
  return initializeApp({ credential: applicationDefault(), projectId, storageBucket, serviceAccountId });
}

export function getAdminApp(): App {
  return getApps()[0] ?? createApp();
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());
export const adminBucket = () => getStorage(getAdminApp()).bucket();
