// Read-only connectivity check. Never writes. Run: npm run verify:firebase
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const app = initializeApp({ credential: applicationDefault(), projectId, storageBucket });

const results = [];
async function check(name, fn) {
  try {
    results.push([name, "OK", await fn()]);
  } catch (e) {
    results.push([name, "FAIL", String(e?.message ?? e).split("\n")[0]]);
  }
}

await check("Project selected", async () => `${app.options.projectId}`);
await check("Auth (list 1 user)", async () => `${(await getAuth(app).listUsers(1)).users.length} user(s) returned`);
await check("Firestore (list root collections)", async () => {
  const cols = await getFirestore(app).listCollections();
  return `${cols.length} root collection(s)`;
});
await check("Storage (bucket metadata)", async () => {
  const [m] = await getStorage(app).bucket().getMetadata();
  return `location=${m.location} (${m.locationType}), class=${m.storageClass}`;
});

for (const [n, s, d] of results) console.log(`${s.padEnd(5)} ${n}: ${d}`);
process.exit(results.some((r) => r[1] === "FAIL") ? 1 : 0);
