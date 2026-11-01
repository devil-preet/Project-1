# Handover — end of Phase 3

Read with `PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `DEVELOPMENT_STATUS.md`, `FIREBASE_SETUP.md`, `TESTING.md`, `DECISIONS.md`.

**Location** `D:\31 oct\Project_1\portal` (git repo from create-next-app; **no commits made**).
**Phase** 3 complete → Phase 4 not started. **Nothing deployed; no production data created or modified; no cloud config changed.** Only read-only probes touched the real project.

## Stack
Next.js 16.4 · React 19.3 · TS 5.9 strict · Tailwind 4 · shadcn (base-ui) · Zod 4 · React Hook Form 7 · firebase 12.19 · firebase-admin 14.5 · Vitest 5 · firebase-tools 15.34 · Node 22 · JDK 21.
Firebase project `project-1-eb8c3` (Firestore nam5, Storage US-EAST1). Details: `FIREBASE_SETUP.md`.

## Phase 3 — what was built
1. **Onboarding wizard** `/onboarding` (`src/components/onboarding/wizard.tsx`): Business → Store identity (+slug, +optional logo, +status) → Branding (colors, theme, live preview) → Review (edit-able) → Create. Step indicator (compact on mobile), validation (RHF+Zod), loading/error/success states, resumable, accessible (labels, `aria-current`, live regions, focus management).
2. **Atomic tenant creation** `createBusinessTx` in `src/services/onboarding.service.ts` (details below).
3. **Business-aware dashboard** `src/app/(dashboard)/{layout,dashboard/page}.tsx`: membership gate, active business, name/role/slug/status, list of the user's businesses, "New business".
4. **Membership model** `src/services/business.service.ts` (`listMemberships`, `pickActiveBusiness`), memoised by `src/lib/auth/tenant.ts`.
5. **Hardening:** `postRoute` gained `auth: "session"|"verified"` (auth before parsing; rate limits keyed by user); CSRF helper accepts multipart for the logo route; new error codes `slug_taken`, `limit_reached`, `not_found`.

## Files
**Created:** `src/services/{business,onboarding}.service.ts` · `src/lib/auth/tenant.ts` · `src/lib/firebase/firestore.ts` (`iso()`) · `src/lib/validations/onboarding.ts` ·
`src/app/onboarding/page.tsx` · `src/app/api/onboarding/{draft,logo,slug-check,complete}/route.ts` · `src/components/onboarding/{wizard,step-indicator,logo-uploader,brand-preview}.tsx` ·
`tests/integration/onboarding.test.ts` · `tests/unit/onboarding.test.ts` · `scripts/probe-prod-index.mjs`.
**Modified:** `src/types/index.ts` (BusinessOnboarding, OnboardingDraft, DraftLogo, Membership, BrandingSettings.defaultTheme; removed OnboardingStep/State) · `src/lib/api/route.ts` · `src/lib/api/client.ts` (`postForm`) ·
`src/lib/security/request.ts` (multipart option) · `src/lib/auth/errors.ts` · `src/lib/utils/slug.ts` (more reserved words) · `src/components/auth/auth-ui.tsx` (`Field` reserves message row, `compact`) ·
`src/app/(dashboard)/layout.tsx`, `dashboard/page.tsx` (placeholder replaced) · `tests/integration/{setup,helpers}.ts`, `tests/rules/{firestore.test,helpers}.ts`, `tests/e2e/smoke.mjs` · `package.json` (integration/e2e scripts now include the Storage emulator) · docs.
`firestore.rules`, `storage.rules`, `firestore.indexes.json` **unchanged** — reviewed: the new data needs no rule change (all new paths are server-written; drafts hit the default-deny) and the `members.uid` collection-group override already existed.

## New Firestore data
| Path | Notes |
|---|---|
| `users/{uid}/onboarding/current` | server-only draft: `status`, reserved `businessId`, `step`, `data`, `logo`, `completedBusinessId` |
| `slugs/{slug}` | `{businessId, type:"primary", createdAt}`; public read; create-only; permanent |
| `businesses/{id}` | name, slug, industry, description, contactEmail/Phone, ownerId, storeStatus, `onboarding{status:"COMPLETED",completedAt,version:1}`, customDomain/subdomain null, deletedAt null |
| `businesses/{id}/members/{uid}` | role **OWNER** for the creator; fields uid, businessId, email, fullName, invitedBy null |
| `businesses/{id}/settings/store` · `settings/branding` | defaults from the wizard (currency USD; branding backgroundColor derived from theme) |
| `businesses/{id}/media/{logoId}` | only when a logo was uploaded |
| `users/{uid}.lastBusinessId` | pointer set at creation |

## Transaction implementation (summary)
`completeOnboarding()` → `ensureDraft()` (creates draft + reserves `businessId` if missing; returns existing result if COMPLETED) → owned-cap check → verify logo object exists → choose slug
(explicit: single attempt; auto: `slugify(storeName)`, `-2`…`-12`, then random suffix; invalid/reserved candidates skipped) → `createBusinessTx`: one Firestore transaction that
reads draft/business/slug, short-circuits if already COMPLETED or if the business already exists for this uid, throws `slug_taken` if the slug doc exists, otherwise `create()`s slug, business,
OWNER member, store & branding settings, media, sets `lastBusinessId`, marks draft COMPLETED. Any failure rolls everything back; the draft stays IN_PROGRESS so the user can retry.

## Security decisions
Caller identity only from the verified session; tenant id only from the server-held draft; body keys stripped by Zod · OWNER assigned in exactly one place · every onboarding endpoint: same-origin/CSRF → verified session → Zod → per-user rate limit ·
anonymous callers get 401 before any schema detail · `?b=` never trusted (membership match, silent fallback) · drafts server-only (default-deny rules) · slugs permanent & create-only · logo content-sniffed, 2 MB, server-written ·
5-owned-business cap · all Phase 1–2 protections intact (CSP, session revocation, rate limiting).

## Role assignment
Creation transaction writes `role:"OWNER"` for the creator only. No endpoint accepts a role. Existing matrix (`src/lib/permissions`) and hierarchy rules unchanged; invitations (Phase 6) must create non-OWNER members server-side via `canAssignRole`.

## Results (all emulator/local; none against the real project)
tsc 0 · eslint 0/0 · build OK · unit 68/68 · rules 54/54 · integration 85/85 · e2e 34/34 · Chrome dev desktop+mobile 24/24 · Chrome production build (strict CSP) 12/12.

## Known issues (top items; full list in `DEVELOPMENT_STATUS.md`)
1. **Production Firestore lacks the `members.uid` collection-group index** (probe confirmed) → Phase 3 will not work on the real project until `firestore.indexes.json` is deployed (approval needed). Emulators cannot detect this.
2. Rules/indexes never deployed; production rules unknown. 3. Resend-verification needs IAM Credentials (D-10). 4. Orphaned logo objects from abandoned drafts; completed drafts retain form data. 5. No business deletion / slug change / switcher yet.

## Unverified
Anything on the real project (incl. onboarding on real Firestore, Admin upload to the real bucket, real-Storage rules), App Hosting deployment, real load behaviour.

## Remaining work
Phases 4–8 (see `DEVELOPMENT_STATUS.md`); plus the approvals listed there.

## Recommended Phase 4 starting point
1. **First, with approval:** deploy `firestore.indexes.json` (and rules) so Phase 3 works on `project-1-eb8c3`; re-run `node --env-file=.env.local scripts/probe-prod-index.mjs` to confirm.
2. Replace the `(dashboard)/layout.tsx` header with the real shell: sidebar (Overview, Products, Categories, Store Appearance, Media Library, Team, Settings, Help) + top bar. The layout already has `session` and `memberships` (`getMemberships`); derive the active business there by also reading `?b=`/`lastBusinessId` via `pickActiveBusiness` (consider moving the active id into the URL path, e.g. `/b/[businessId]/…`, so every nested route is explicit and verifiable with `requireBusinessAccess(businessId, permission)`).
3. Build the **business switcher** (list = `getMemberships`; switching = a POST that validates membership then updates `users/{uid}.lastBusinessId`).
4. **Overview metrics** from real Firestore: counts via `count()` aggregation queries on `products`/`categories` (empty states while Phase 5 is pending — do not fabricate numbers); "store completion %" from real fields (logo, description, contact, published).
5. Add `loading.tsx`/`error.tsx`, nav permission filtering via `can(role, …)`, and tests alongside `tests/integration/guard.test.ts` for any new tenant-scoped routes.

---
# Catalogue & Storefront milestone - handover
**Built:** workspace (`/b/[id]/...`), categories, products, product images, branding/settings/media/team pages, public storefront (`/s/...`). **Not deployed; nothing in the real project was changed.**
Details: `ARCHITECTURE.md` (routes, data, queries), `DECISIONS.md` D-24..D-33, `TESTING.md` (results). Run locally: emulators + `npm run dev` (see `FIREBASE_SETUP.md`).

**Needs your approval / action before this works on the real project (none done by me):**
1. **Deploy the app** (App Hosting) - new routes and server code.
2. **Firestore/Storage rules are still deny-all live.** The app does not need them (Admin SDK + app-served images), so the storefront works with them as they are. Deploying the repo rules is optional hardening; review first.
3. **Indexes:** none new. Confirm all 14 composites are READY (`npx firebase firestore:indexes`), or catalogue lists may fail with FAILED_PRECONDITION until they finish building.
4. Existing businesses were created with currency USD; switch to INR in Settings **before** adding products if desired (locked afterwards).
5. Optional: IAM Credentials API (resend-verification), Firestore TTL for `rateLimits`.

---
# Nova / Everloom redesign - handover
Design source: Nova prototype (Everloom colours). Full description, tokens and deviations: `DESIGN_SYSTEM.md`; decisions D-35..D-38.
**Changed:** global theme/tokens and fonts, UI primitives, workspace shell (rail + top bar), all workspace pages, dashboard, auth and onboarding screens, and the public storefront. **Not changed:** routes, API handlers, services, Firestore data, rules, indexes, permissions.
**Not deployed. No Firebase configuration or data was touched.**
