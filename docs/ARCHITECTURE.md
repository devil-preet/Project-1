# Architecture

## Folder structure (`portal/`)
```
src/
  proxy.ts                    Next 16 "middleware": optimistic redirect + per-request CSP nonce
  app/
    (auth)/{login,register,forgot-password}/page.tsx   public pages; (auth)/layout.tsx redirects signed-in users
    (dashboard)/layout.tsx    requirePageSession() — verified session required (placeholder shell)
    (dashboard)/dashboard/page.tsx
    verify-email/page.tsx     session required, email may be unverified
    onboarding/page.tsx       Phase 3: verified session; redirects users who already have a business to /dashboard (unless ?new=1)
    api/onboarding/{draft,logo,slug-check,complete}/route.ts   Phase 3 (see "Onboarding & tenant creation")
    auth/action/page.tsx      handles Firebase email links (verifyEmail / resetPassword) if action URL is customised
    api/auth/*/route.ts       register, login, logout, forgot-password, reset-password, verify-email,
                              resend-verification, session(GET)
  components/auth/*           client forms (React Hook Form + Zod) and shared auth UI
  components/onboarding/*     wizard.tsx (4-step flow), step-indicator, logo-uploader, brand-preview
  components/ui/*             shadcn/ui primitives (base-ui based: use `render`, not `asChild`)
  lib/
    config.ts                 constants (cookie name, session lengths, protected prefixes)
    api/route.ts              postRoute(): CSRF -> body limit -> JSON -> Zod -> rate limit -> handler -> safe errors
    api/client.ts             browser postJson() (sends required CSRF headers) + safeNext()
    auth/{session,guard,errors,tenant}.ts   (tenant.ts = request-memoised membership lookup)
    firebase/{admin,identity,client}.ts
    security/{request,rate-limit}.ts
    permissions/index.ts      role matrix (single source of truth)
    validations/auth.ts       Zod schemas
    utils/slug.ts
  services/{auth,user,business,onboarding}.service.ts   business logic, no HTTP/React
                              (onboarding.service.ts holds THE tenant-creation transaction)
  types/index.ts              all domain entities (DTO shapes; timestamps as ISO strings)
firestore.rules  storage.rules  firestore.indexes.json  firebase.json  apphosting.yaml  .firebaserc
tests/{unit,rules,integration,e2e}   scripts/   docs/
```
`src/lib/firebase/client.ts` (Web SDK) is **unused so far**; it is for Phase 5 (client uploads).

## Responsibilities
- **Frontend** (client components): forms, validation for UX, calling `/api/*`. Holds no tokens.
- **Backend** (route handlers / services): every credential flow, session issuing, authorization,
  all Firestore writes. Marked `import "server-only"`; verified absent from the client bundle.
- **Rules**: independent defence in depth; see below.

## Authentication flow
All via our server → Firebase Identity Toolkit REST API (`lib/firebase/identity.ts`), so we can rate-limit.
1. **Register** `POST /api/auth/register`: `accounts:signUp` → set displayName → create `users/{uid}`
   (idempotent) → `sendOobCode VERIFY_EMAIL` (best effort) → `createSessionCookie`. Duplicate → 409.
2. **Login** `POST /api/auth/login`: `signInWithPassword` → ensure profile (self-heals) → session cookie.
3. **Verify email**: user opens the emailed link (Firebase-hosted handler, or `/auth/action`); the session
   re-reads the live user record, so no re-login is needed. `/verify-email` offers resend (3/h) and a status check.
4. **Reset**: `forgot-password` (always identical response) → emailed link → `reset-password` (`accounts:resetPassword`);
   Firebase revokes refresh tokens, so existing sessions die.
5. **Logout**: clears cookie; `{everywhere:true}` calls `revokeRefreshTokens(uid)`.

## Session architecture
Firebase session cookie `__session` (the only cookie App Hosting forwards). HttpOnly, SameSite=Lax,
Secure in production. `remember` → 14 days persistent; otherwise a browser-session cookie with 12 h server expiry.
`verifySessionValue()` uses `verifySessionCookie(value, checkRevoked=true)`, then (only if the `name` claim or
`email_verified` is missing/false) consults the live user record. Any failure → treated as logged out (fail closed).
`getSession()` is memoised per request with React `cache`.

Authorization layers, outermost to innermost:
`proxy.ts` (cookie-presence redirect, NOT trusted) → layouts `requirePageSession` → handlers/actions
`requireSession`/`requireVerifiedSession`/`requireBusinessAccess` → Firestore/Storage rules.

## CSRF and request hardening (`lib/security/request.ts`)
`Sec-Fetch-Site` must be `same-origin`; `Origin` must equal host; `X-Requested-With: fetch` and
`Content-Type: application/json` required. Body ≤ 8 KB. No double-submit cookie (App Hosting strips other cookies).
Client IP for rate limits = right-most `X-Forwarded-For` entry (`TRUSTED_PROXY_HOPS`, default 1) — the left side is spoofable.

## Rate limiting (`lib/security/rate-limit.ts`)
Fixed window, Firestore transaction on `rateLimits/{sha256(key)}` = `{count, windowStart(ms), expiresAt(Timestamp)}`.
Fails closed. Limits: register 5/h/IP · login 30/15m/IP, 5/15m/IP+email, 20/h/email · forgot 10/h/IP, 3/h/IP+email ·
reset 10/h/IP · verify 20/h/IP · resend 10/h/IP, 3/h/user · onboarding (per user): draft 120/10m, slug-check 90/10m, logo 10/10m, complete 10/h.

## Firestore data model
| Path | Written today? | Notes |
|---|---|---|
| `users/{uid}` | **yes** (Phase 2) | uid, email, fullName, photoURL, lastBusinessId, createdAt, updatedAt |
| `rateLimits/{hash}` | **yes** | server-only; TTL on `expiresAt` recommended |
| `users/{uid}/onboarding/current` | **yes** (Phase 3) | server-only draft: status IN_PROGRESS/COMPLETED, reserved `businessId`, step, data, logo, completedBusinessId |
| `slugs/{slug}` → `{businessId, type:"primary", createdAt}` | **yes** (Phase 3) | public read; create-only inside the tenant transaction; never deleted/released |
| `businesses/{businessId}` | **yes** (Phase 3) | name, slug, industry, description, contact*, ownerId, storeStatus, onboarding{status,completedAt,version}, customDomain/subdomain (null), deletedAt (soft delete) |
| `businesses/{id}/members/{uid}` | **yes** (Phase 3) | role OWNER/ADMIN/MANAGER/EDITOR; doc id = uid; `uid` field indexed for collection-group lookup |
| `businesses/{id}/settings/store`, `settings/branding` | **yes** (Phase 3 defaults) | store: displayName, description, currency USD, status, publicVisibility. branding: colors, defaultTheme, logo MediaRef, contact, social |
| `businesses/{id}/media/{mediaId}` | **yes** if a logo was uploaded | metadata + storagePath; created inside the tenant transaction |
| `businesses/{id}/invitations/{id}` | Phase 6 | admin-readable only |
| `businesses/{id}/categories/{id}` | Phase 5 | hard delete; `productCount`; `searchName` |
| `businesses/{id}/products/{id}` | Phase 5 | price in cents; ≤ N images embedded; hard delete |
Types for all of these already exist in `src/types/index.ts`. Indexes: `firestore.indexes.json`.

## Storage architecture
Path `businesses/{businessId}/media/{fileName}` only. Create-only (no overwrite), JPEG/PNG/WebP, 0 < size ≤ 10 MB,
uploader must be a member (rules read `members/{uid}` via `firestore.exists`). Delete: OWNER/ADMIN/MANAGER.
Reads are public (storefront assets). Client uploads will need Firebase client auth → custom token (Phase 5).

## Tenant isolation
Server: `authorizeMember(db, uid, businessId, permission)` — validates id format, reads `members/{uid}` and the
business doc together, rejects deleted businesses, validates the role enum, checks the permission. Every failure is
the same `forbidden` (no existence oracle). Rules: members read own tenant; all client Firestore writes denied.
Tests prove both layers (see `TESTING.md`).

## Role matrix (`lib/permissions/index.ts`)
| Permission | OWNER | ADMIN | MANAGER | EDITOR |
|---|:-:|:-:|:-:|:-:|
| business:view, team:view | ✓ | ✓ | ✓ | ✓ |
| product:write, media:upload | ✓ | ✓ | ✓ | ✓ |
| product:publish, product:delete, category:write/delete, media:delete, branding:update | ✓ | ✓ | ✓ | – |
| business:update, settings:update, team:invite, team:manage | ✓ | ✓ | – | – |
| business:delete | ✓ | – | – | – |
Team hierarchy: an actor can assign/modify only roles strictly below their own; OWNER is never assignable.

## Onboarding & tenant creation (Phase 3)
**Flow:** `/onboarding` (4 steps: business → store identity → branding → review) → `POST /api/onboarding/complete` → `/dashboard`.
Progress is saved server-side after each step (`POST /api/onboarding/draft`), so a refresh or a different device resumes.

**Status model** (derived from `users/{uid}/onboarding/current`): `NOT_STARTED` (no draft) → `IN_PROGRESS` → `COMPLETED`.
The business's own `onboarding.status = "COMPLETED"` is written only by the creation transaction.

**Idempotency:** the draft reserves a Firestore auto-id (`businessId`) the first time it is created. The business can only ever be created
under that id, so repeating/double-clicking/retrying "create" cannot produce a second business. A repeat returns `{created:false}` with the
same id. A deliberate additional business requires a fresh draft (`fresh:true`, or `/onboarding?new=1`), allowed once the previous draft is COMPLETED.

**The transaction** (`createBusinessTx` in `onboarding.service.ts`) — reads draft, business, slug; then writes, all-or-nothing, every write a `create()`
(never an overwrite): `slugs/{slug}` · `businesses/{id}` · `members/{uid}` (role **OWNER** — the only place OWNER is ever assigned) ·
`settings/store` · `settings/branding` · `media/{logoId}` (if any) · `users/{uid}.lastBusinessId` · draft → COMPLETED. A taken slug aborts the whole
transaction. Auto-generated slugs (empty slug field) retry `name`, `name-2`, … (12 tries) then a random suffix; an explicit slug is never changed
(returns 409 `slug_taken` with a field error). Firestore serialises concurrent claims on the same `slugs/{slug}` document, so exactly one wins.

**Identity of the caller is never taken from the body.** The complete route's Zod schema strips unknown keys (`role`, `ownerId`, `businessId`, `uid`…);
user id/email/name come from the verified session, the business id from the server-held draft.

**Multiple businesses per user:** membership is only `businesses/{id}/members/{uid}`; there is no single-business field on the user. `listMemberships(uid)`
queries the `members` collection group by `uid` (index override in `firestore.indexes.json`), then loads the businesses. `users/{uid}.lastBusinessId`
is a convenience pointer, always re-validated against memberships. A user may OWN at most `MAX_OWNED_BUSINESSES` (5).

**Active business** (`pickActiveBusiness`, pure): `?b=<id>` only if it matches a membership → else `lastBusinessId` (if still a membership) → else first.
No cookie (App Hosting strips them) and no write on GET. A rejected `?b=` is ignored and never confirms the id exists.

**Slugs:** global registry `slugs/{slug}`; lowercase, `[a-z0-9]` + single hyphens, 2–48 chars, reserved words rejected (`lib/utils/slug.ts`). Slugs are permanent:
nothing deletes them. A future slug change must keep the old slug as `type:"redirect"` → so storefront URLs (`/s/{slug}`) never silently break.

**Logo:** `POST /api/onboarding/logo` (multipart, ≤ 2 MB). The server sniffs magic bytes (PNG/JPEG/WebP only; client MIME ignored), stores it with the Admin SDK at
`businesses/{reservedId}/media/{uuid}.ext`, and records it in the draft. The `media` document and `branding.logo` are created inside the transaction. Replacing/removing
deletes the previous object.

**Dashboard gate:** `(dashboard)/layout.tsx` → `requirePageSession()` → `getMemberships()`; zero memberships ⇒ `/onboarding`. `/onboarding` ⇒ `/dashboard` when a membership exists
(unless `?new=1`).

## API / server-action pattern
Route handlers use `postRoute({schema, limits, handler})`; responses are `{ok:true,…}` or
`{ok:false, code, error, fieldErrors?}` with user-safe messages (`AuthError`). Tenant-scoped operations must start with
`requireBusinessAccess(businessId, permission)`. Services contain logic; routes stay ~10 lines.

## Catalogue workspace & public storefront (milestone 5)

### Routes
| Route | Auth | Purpose |
|---|---|---|
| `/b/[businessId]` -> `/overview` | member | stats + getting-started checklist |
| `/b/[id]/products`, `/products/new`, `/products/[productId]` | member (`product:write` for forms) | card grid, filters, create/edit |
| `/b/[id]/categories` | member (`category:write` to change) | category cards, search, reorder, create/edit/delete |
| `/b/[id]/branding` `/media` `/team` `/settings` | member; branding needs `branding:update`, settings `settings:update` | logo+colours, media library, member list (read-only), publish + store details |
| `/s/[slug]`, `/s/[slug]/category/[categorySlug]`, `/s/[slug]/product/[productSlug]` | **public** | storefront |
| `POST /api/b/[id]/categories` `products` `settings` | verified session + role | action-based JSON mutations |
| `POST /api/b/[id]/media` (multipart) | `media:upload` | image upload |
| `GET /api/b/[id]/media/[mediaId]` | member | workspace preview |
| `GET /api/public/media/[id]/[mediaId]` | public, only attached-and-visible assets | storefront images |

Every page calls `requireWorkspace(businessId, permission)` itself (layouts do not re-run on client navigation); every API goes through `businessRoute` (CSRF, session, size, Zod, `authorizeMember` on `members/{uid}`, rate limit).
The businessId in the URL is re-verified and never trusted; failures look identical to "does not exist" (404/403).

### Data (all under `businesses/{id}/`)
- `categories/{id}`: name, slug, description, image(MediaRef), active, sortOrder, productCount, searchName, timestamps.
- `products/{id}`: name, slug, shortDescription, description, categoryId, images[] (cover first), priceCents (int), compareAtPriceCents, currency, sku, stockQuantity, status draft|active|archived, availability, featured, sortOrder, seoTitle, seoDescription, searchName, timestamps.
- `media/{id}`: storagePath, contentType, sizeBytes, fileName, uploadedBy, **ownerType/ownerId**, deletedAt.
- `slugReservations/{kind}__{slug}`: `{refId}` (server-only).
- Storage: `businesses/{id}/media/{uuid}.{png|jpg|webp}` (type from magic bytes, create-only).

### Queries and indexes
Admin lists and storefront queries are built from `lib/catalog/query-plan.ts`; `tests/unit/indexes.test.ts` asserts every plan shape is covered by `firestore.indexes.json`. **No new indexes were needed** (the existing composites already cover
status/category x created/name/price/search and `featured+status+createdAt`). No new collection-group queries were added. Pagination is cursor-based (document id), page size 24 (admin) / 12 (storefront); categories capped at 200 per business; storefront scans are bounded (4 reads per page).

### Storefront reads
`services/public-store.service.ts` returns only allow-listed fields (no owner, members, storage paths, stock counts, timestamps, internal settings). Contact email/phone entered as branding contact details **are** shown in the footer.
