// Safety interlock: integration tests are destructive. They may only ever run
// against the local emulators under a demo- project, never a real Firebase project.
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!authHost || !fsHost) {
  throw new Error("Refusing to run: Firebase emulators are not active. Use `npm run test:integration`.");
}
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-brand-portal";
process.env.GCLOUD_PROJECT = "demo-brand-portal";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "fake-api-key";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error("Refusing to run: Storage emulator is not active.");
}
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "demo-brand-portal.firebasestorage.app";
