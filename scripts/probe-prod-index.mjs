// Read-only: runs the exact membership query Phase 3 uses, against the REAL project.
// Matches no documents; it only reveals whether the required index exists.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({ credential: applicationDefault(), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
try {
  const snap = await getFirestore(app).collectionGroup("members").where("uid", "==", "__index_probe__").limit(1).get();
  console.log(`members(uid) collection-group query: OK (${snap.size} docs) -> index/exemption is deployed`);
} catch (e) {
  console.log("members(uid) collection-group query: FAILED ->", String(e.message).split("\n")[0].slice(0, 200));
  console.log("=> the fieldOverrides entry in firestore.indexes.json is NOT deployed yet (needs your approval to deploy).");
}
