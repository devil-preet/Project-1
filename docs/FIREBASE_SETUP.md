# Firebase Setup

No secrets belong in this file or in git.

## Project (non-secret)
| Item | Value |
|---|---|
| Project ID | `project-1-eb8c3` |
| Auth domain | `project-1-eb8c3.firebaseapp.com` |
| Storage bucket | `project-1-eb8c3.firebasestorage.app` (location **US-EAST1**, regional) |
| Firestore | `nam5` (US multi-region) |
| Web app ID | `1:374634192845:web:b1a635a7524a3a57e16e84` |
| Enabled | Authentication (Email/Password), Firestore, Storage, Identity Toolkit API |
| Disabled (checked read-only) | `iamcredentials.googleapis.com`, `iam.googleapis.com` |

## Authentication setup
Email/Password provider enabled (verified with a read-only sign-in probe). Optional console tweaks:
- **Authentication → Templates → (Email address verification / Password reset) → Customize action URL** →
  `https://<your-domain>/auth/action` to use our branded handler. Otherwise Firebase's hosted page is used (works).
- **Authentication → Settings → Authorized domains**: add the production domain (`localhost` is pre-authorized).
  The `continueUrl` in emails must be on this list.
- Consider enabling **email enumeration protection** (Settings → User actions) and re-running the auth tests' assumptions.

## Local environment variables (`.env.local`, git-ignored; template: `.env.example`)
Public: `NEXT_PUBLIC_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,STORAGE_BUCKET,MESSAGING_SENDER_ID,APP_ID}`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MAX_UPLOAD_MB`, `NEXT_PUBLIC_USE_EMULATORS`.
Server: `SESSION_COOKIE_NAME`, `TRUSTED_PROXY_HOPS` (default 1), `FIREBASE_AUTH_SERVICE_ACCOUNT_ID` (optional, see below),
`FIREBASE_SERVICE_ACCOUNT_JSON` (discouraged; leave empty — use ADC).

## Application Default Credentials (no key files)
```
winget install Google.CloudSDK            # once; reopen the terminal
gcloud auth application-default login      # browser
gcloud auth application-default set-quota-project project-1-eb8c3
npm run verify:firebase                    # read-only check of Auth/Firestore/Storage + bucket location
```
Credentials are stored in `%APPDATA%\gcloud\application_default_credentials.json` (outside the repo).
`admin.ts` uses ADC automatically; when an emulator host env var is set it uses **no credentials**, so tests cannot reach production.

## Firebase CLI
Installed per project (`npx firebase …`, v15.34). `.firebaserc` links `default` → `project-1-eb8c3`.
Login (`npx firebase login`) is only needed to deploy rules/indexes/hosting — **nothing has been deployed**.

## Emulators
`firebase.json`: auth 9099 · firestore 8080 · storage 9199 · UI 4000. Tests use a throwaway project id
`demo-brand-portal` (`--project demo-brand-portal`) which can never match a real project. Requires a JDK (Temurin 21 installed).
If a terminal predates the JDK install, `java` may be missing from PATH — reopen the terminal.

## Running locally
Against emulators (safe, no real users/emails): in one terminal
`npx firebase emulators:start --only auth,firestore,storage --project demo-brand-portal`, in another set
`FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-brand-portal` and run `npm run dev`. Emulator "emails" are printed in the emulator
terminal/UI (http://127.0.0.1:4000).
Against the real project: `npm run dev` with `.env.local` as is (this WILL create real users / send real email — see
the procedure below).

## Firestore TTL for rate limits (not yet applied — requires approval)
Console: Google Cloud Console → Firestore → *Time-to-live* → **Create policy**: collection group `rateLimits`,
timestamp field `expiresAt`. CLI equivalent:
`gcloud firestore fields ttls update expiresAt --collection-group=rateLimits --enable-ttl --project=project-1-eb8c3`.
Not needed for correctness (stale windows reset on next hit); prevents unbounded growth. Deletion is asynchronous.

## Custom-token signing (needed for resend-verification, and likely Phase 5 uploads) — not yet applied
`createCustomToken()` signs a JWT. Without a private key it calls the **IAM Credentials API** (`signBlob`).
Needed: (1) enable `iamcredentials.googleapis.com`; (2) grant `roles/iam.serviceAccountTokenCreator` on the runtime service
account **to itself** (App Hosting: `firebase-app-hosting-compute@project-1-eb8c3.iam.gserviceaccount.com` — confirm in
the console after the first backend exists). Local real-project use additionally needs your user to hold that role and
`FIREBASE_AUTH_SERVICE_ACCOUNT_ID=<email>` (Console → Project settings → Service accounts shows the Admin SDK account email;
do NOT generate a key). Pure emulator work needs none of this.

## Firestore indexes — deploying and verifying (REQUIRED before the app can run on a real project)
**Why this matters:** the Firestore *emulator does not enforce indexes*, so every test passes locally while production rejects an un-indexed query with
`9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index for collection members and field uid.`
Phase 3's membership lookup (`db.collectionGroup("members").where("uid", "==", uid)` in `src/services/business.service.ts`) needs exactly that index.

**What is configured (already correct in the repo):** `firestore.indexes.json` → `fieldOverrides` entry `members.uid` with a `COLLECTION_GROUP` / `ASCENDING` index
(plus `COLLECTION`), and the 15 composite indexes for Phase 5 queries. `firebase.json` → `firestore.indexes` points at that file. A collection-group query on a
*single* field is not covered by Firestore's automatic indexes; it needs this explicit single-field exemption.

**Option A — Firebase CLI (recommended; makes the file the source of truth).** Needs `npx firebase login` and your approval:
```
npx firebase deploy --only firestore:indexes --project project-1-eb8c3
```
If the CLI asks whether to delete indexes that exist in the project but not in the file, answer **No** unless you intend to (never use `--force` casually).
Use `--only firestore` to deploy rules and indexes together (rules are also not yet deployed — review `firestore.rules` first).

**Option B — Console (quickest for the immediate error):** Firebase Console → Firestore Database → **Indexes** → **Single field** tab → **Add exemption** →
Collection ID `members`, Field path `uid` → under *Collection group* enable **Ascending** (leave Collection ascending too) → **Save**. Or open the link printed in the error message,
which pre-fills the index. Building takes from seconds to a few minutes on an empty project; wait for status **Enabled**. A later CLI deploy of the same file is compatible with the console-created entry.

**Verify (read-only, safe):**
```
node --env-file=.env.local scripts/probe-prod-index.mjs
```
Expected: `members(uid) collection-group query: OK (0 docs) -> index/exemption is deployed`. It queries a non-existent uid, reads no data and writes nothing.
Optionally compare with `npx firebase firestore:indexes --project project-1-eb8c3` (needs login).

**Preventing this in future**
1. `tests/unit/indexes.test.ts` (runs in `npm test`) scans `src/` for every `collectionGroup(...)` query and fails if `firestore.indexes.json` lacks the matching
   COLLECTION_GROUP exemption (one field) or composite index (several fields), and checks `firebase.json` deploys the file. **When you add a collection-group query, add its index in the same commit.**
   For ordinary (single-collection) queries with 2+ filters/orders, add a composite index; Firestore's error message includes a console link that generates it.
2. Make index deployment part of every release: deploy `firestore:indexes` (and rules) *before* the app version that needs them, and wait for **Enabled**.
3. Smoke-test after each deploy with the probe script (extend it with any new collection-group/composite query) — the emulator cannot catch this class of bug.
4. Prefer the CLI over console clicking so `firestore.indexes.json` stays authoritative; if you create an index in the console to unblock yourself, add it to the file afterwards
   (`npx firebase firestore:indexes > firestore.indexes.json` exports the live set).

## Safe procedure for testing against the REAL project (requires explicit go-ahead each time)
1. Prefer a **separate dev Firebase project** for destructive/real-email tests; if using production, use dedicated accounts
   such as `<you>+portal-test1@gmail.com` (plus-addressing delivers to your inbox).
2. Register (≤ 5 per hour per IP) → expect verification email within a minute → `/verify-email` shows pending state.
3. Click the link → "I've verified my email" → dashboard. 4. Sign out → sign in (try wrong password once).
5. Resend: only works after the IAM item above. 6. Forgot password → email → new password → old session rejected.
7. "Sign out everywhere" from a second browser → first session redirected to /login.
8. Cleanup (needs approval): delete the test users in Authentication and their `users/{uid}` docs.
Watch for: spam-folder delivery, sender name, authorized-domain errors, Firebase's own `TOO_MANY_ATTEMPTS`.

## Regions
See `DECISIONS.md` D-8. Recommended App Hosting backend region: `us-central1` (colocated with Firestore `nam5`).
Confirm `TRUSTED_PROXY_HOPS` after the first deployment by logging one request's `x-forwarded-for` (without storing it).
