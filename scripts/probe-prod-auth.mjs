// Read-only production probes. Creates/modifies nothing.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "probe-nonexistent@example.invalid", password: "x", returnSecureToken: true }),
});
const body = await res.json();
console.log("signInWithPassword probe:", res.status, body.error?.message ?? "unexpected success");
console.log("  (INVALID_LOGIN_CREDENTIALS / EMAIL_NOT_FOUND => API key valid + Email/Password provider enabled; OPERATION_NOT_ALLOWED => provider disabled)");

const app = initializeApp({ credential: applicationDefault(), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
try {
  await getAuth(app).createCustomToken("probe-uid"); // signs only; creates no user
  console.log("createCustomToken with local ADC: OK");
} catch (e) {
  console.log("createCustomToken with local ADC: FAIL ->", String(e.message).split("\n")[0].slice(0, 160));
}
