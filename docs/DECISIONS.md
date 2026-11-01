# Architectural Decisions

**D-1 Firestore, not PostgreSQL.** Mandated by the brief. Nested `businesses/{id}/…` paths give natural tenant scoping,
cheap per-tenant rules, and let System 2 read the same data. Trade-offs: no joins/transactions across large sets, prefix search only,
composite indexes required (declared in `firestore.indexes.json`).

**D-2 Firebase Authentication.** Mandated. We use it as an identity store only; sessions are our own cookies (D-3).

**D-3 Server-side credential flows + session cookies.** Register/login/reset/verify/resend go through our server calling the
Identity Toolkit REST API, not the browser SDK. Why: (a) rate limiting is impossible for calls that go browser→Firebase;
(b) no ID/refresh token ever reaches JavaScript; (c) uniform error mapping and no user enumeration. Cost: passwords transit our server
(HTTPS, never stored/logged) and resend needs token minting (D-10). Sessions are Firebase session cookies (`__session`, HttpOnly,
SameSite=Lax) verified with `checkRevoked=true`.

**D-4 Hard delete for products/categories; soft delete for businesses/media.** A permanent `deletedAt == null` filter on every
query multiplies composite indexes and complicates rules/pagination. Categories are guarded by `productCount`; products by a
confirmation. Businesses (tenant-wide blast radius) and media (Storage cleanup) keep `deletedAt`.

**D-5 Role hierarchy.** OWNER > ADMIN > MANAGER > EDITOR; an actor may assign/modify only roles strictly below their own; OWNER is
never assignable (transfer will be a separate flow). EDITOR authors but cannot publish/delete/restructure. Single source of truth:
`lib/permissions`.

**D-6 Storage images are publicly readable.** The storefront (System 2) and download URLs need public images; paths are
unguessable-by-design only weakly, so **never upload anything private**. Writes/deletes are tenant- and role-restricted; objects
are immutable.

**D-7 Firebase App Hosting (not bare Cloud Run).** Git-based build/deploy of Next.js SSR, built-in secrets and runtime identity,
stays in the Firebase tooling. Cloud Run remains the fallback. Constraint: only the `__session` cookie reaches the backend (drives D-9).

**D-8 Regions.** Firestore `nam5` (US multi-region), Storage `US-EAST1` (regional) — fixed at creation, not to be moved.
- *Latency*: Firestore traffic comes from the server (many round-trips per request) → colocate the App Hosting backend with Firestore
  (`us-central1`). Browser↔Storage traffic is direct, so the Storage region mainly affects distance to users, not our server.
- *Cost*: server↔Storage across regions incurs inter-region egress (small: the server rarely moves image bytes). Storage rules call
  Firestore (`firestore.exists/get`), billed as Firestore reads, one or two per upload/delete. US-EAST1 is an Always-Free-eligible
  region for Cloud Storage (verify current pricing).
- *Architecture*: no code change needed; System 2 should front Storage with a CDN. Revisit only if users are outside North America.

**D-9 CSRF without a token cookie.** Fetch-metadata + Origin + custom header + JSON content type (see ARCHITECTURE).
Server Actions already enforce Origin natively.

**D-10 Custom-token signing (open decision; recommended: enable IAM Credentials).**
*What needs signing:* `adminAuth().createCustomToken(uid)` in `mintIdTokenFor()` (`src/lib/firebase/identity.ts`), used only by
resend-verification (we have a session but no password/ID token to call `sendOobCode`). *Why IAM:* a custom token is a JWT signed with
a service-account key; on Cloud Run/App Hosting or with user ADC there is no key, so the SDK calls `iamcredentials.googleapis.com`
`signBlob`. (`iam.googleapis.com` — which I mistakenly hit first — is NOT required.) *Permissions:* API enabled +
`iam.serviceAccounts.signBlob` via `roles/iam.serviceAccountTokenCreator` on the runtime SA, granted to itself. *Billing:* the API has no
usage charge; enabling it does not enable billing. *Security:* lets the runtime SA sign arbitrary JWTs as itself — i.e. mint a login for
any uid. A compromised server already holds Admin SDK power (it can reset passwords), so the marginal risk is small; scope the grant to
that single SA/principal. *Alternatives:* (a) require password re-entry to resend (no signing; worse UX; no cloud change);
(b) `generateEmailVerificationLink` + our own mail provider (new infrastructure); (c) put ID tokens in the browser (rejected, undoes D-3).
**Recommendation:** enable the API and grant the role once, because Phase 5 client uploads also need custom-token sign-in (Storage rules
require `request.auth`), so the dependency is coming regardless. Until approved, resend works only on emulators.

**D-11 Next.js Cache Components disabled.** The scaffold enabled it; every page here is per-user dynamic, and the mode forces
Suspense around all cookie access with no caching benefit. `next.config.ts` leaves it off.

**D-12 CSP via proxy with nonces.** `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `unsafe-inline`/`unsafe-eval` in production),
`style-src 'self' 'unsafe-inline'` (inline style props from React/UI libs; script injection stays locked), `object-src 'none'`,
`base-uri/form-action 'self'`, `frame-ancestors 'none'`. `img-src`/`connect-src` pre-allow the Firebase Storage/Auth hosts Phases 3–5 need.
Verified in real Chrome on the production build. When System 2 or analytics scripts are added, extend deliberately.

**D-13 Rate limiting in Firestore, fail closed.** In-memory counters are per-instance and useless on Cloud Run. Cost: 1–3 transactional
writes per auth attempt. Fixed windows (burst at window edges accepted). TTL recommended, not required.

**D-14 Clients never write Firestore.** All mutations are server-side after `requireBusinessAccess`; rules deny every client write. One
write path means invariants (slug uniqueness, `productCount`) live in one place. Cost: no client-side realtime writes; reads can still use
the Web SDK under rules.

**D-16 Idempotent tenant creation via a server-reserved business id (Phase 3).** The onboarding draft reserves a Firestore auto-id; the business can only be created
under it. Alternatives rejected: a client-supplied idempotency key (client-controlled), or "one business per user" checks (contradicts multi-business). Result: refresh,
double-click and retry storms are all no-ops after the first success, and a failed attempt leaves nothing behind (single transaction of `create()`s).

**D-17 Onboarding status is derived, not stored on the user (Phase 3).** `NOT_STARTED/IN_PROGRESS/COMPLETED` come from the draft document; the business records its own
`onboarding.status`. Keeps one source of truth, avoids drift, and "complete" is only ever written by the creation transaction.

**D-18 Permanent slug registry (Phase 3).** `slugs/{slug}` is create-only and never deleted, so a slug can never be re-claimed by someone else and storefront URLs
(`/s/{slug}`) stay stable; a future rename keeps the old slug as `type:"redirect"`. Reserved words include route/brand words (`admin`, `api`, `s`, `new`, …).

**D-19 Active-business selection without cookies (Phase 3).** App Hosting forwards only `__session`, so the "current business" is `?b=` (validated against memberships)
→ `lastBusinessId` → first membership, computed by a pure function with no writes on GET. A business switcher (Phase 4) will update `lastBusinessId` via a POST.

**D-20 Logo upload goes through our server (Phase 3).** Browser uploads need client-side Firebase auth (custom token → the unresolved IAM item, D-10). A server upload
(Admin SDK) works today, lets us validate real content (magic bytes) instead of trusting MIME, and ties the object and its `media` doc to the creation transaction. Phase 5's
multi-image uploads can revisit direct-to-Storage once D-10 is settled.

**D-21 Abuse bounds (Phase 3).** Max 5 OWNED businesses per account; per-user rate limits on every onboarding endpoint; logo ≤ 2 MB; draft/complete bodies ≤ 16 KB.

**D-22 Draft is server-only (Phase 3).** `users/{uid}/onboarding/current` has no client rule (default-deny) — even its owner cannot read or write it, so a user cannot forge
a draft (e.g. choose their own `businessId`). Tested in `tests/rules`.

**D-23 Reserved validation rows (Phase 3 UX).** A real browser test showed that a validation message appearing on blur shifted the layout and swallowed the next click
(Back/Continue). Field now reserves its message row, and Back ignores mouse-down focus changes.

**D-15 Dependencies.** `firebase` pinned to 12.x (rules-unit-testing peer); `cn` npm package replaced by `clsx`+`tailwind-merge`
(shadcn generated an import from an unfamiliar package); no new runtime dependencies in Phase 2.

## Catalogue & Storefront milestone

**D-24 Keep the existing field names.** The brief used `priceAmount`, upper-case `ACTIVE/DRAFT/ARCHIVED` and a category `status`. The deployed indexes, the rules and the data model already use
`priceCents`, lower-case `status`, and a category `active` boolean, so those names are kept (no duplicate/conflicting fields). `availability` (`in_stock|out_of_stock`) is new. `images[0]` is the cover;
the DTO exposes it as `primaryImage`.

**D-25 Images are served by the application, not by Storage URLs.** Live Storage rules are deny-all, so stored `firebasestorage.googleapis.com` URLs return 403 (this also affects the Phase 3 logo URL). New media
is referenced by `mediaId`; URLs are computed per audience: `/api/b/{biz}/media/{id}` (members only, re-authorised each request) and `/api/public/media/{biz}/{id}`, which streams bytes only if the asset is attached
to something customers may see (branding logo of a published store, an active category, an active product in an active category). Unattached uploads are never public. Works with the rules still locked down.

**D-26 Media ownership.** Uploads are created unattached (`ownerType:null`). A product/category/branding claims an asset inside its own transaction; an asset owned by another record or tenant is refused.
Assets removed from a record are marked deleted and their Storage object deleted - only after the server verified they belonged to that record and live under `businesses/{id}/media/`.

**D-27 Slug uniqueness per business** uses server-only reservation documents `businesses/{id}/slugReservations/{category|product}__{slug}` (denied to clients by the catch-all rule), created/released in the same
transaction as the record. Reservations also give the storefront an O(1) slug-to-id lookup. Renaming a record keeps its slug unless an explicit new slug is given.

**D-28 `productCount` on categories** is maintained transactionally by product create/move/delete, so category deletion is refused (409) while products exist, with no extra query.

**D-29 Storefront visibility is decided in code, not by client rules.** `public-store.service.ts` is the only public read path (Admin SDK, explicit field allow-list). A product is visible only if: store published, product
`active`, its category `active`. Category inactive means product pages, category page and images all 404 immediately. Unknown, unpublished and deleted stores are indistinguishable (404).

**D-30 Image limit 8 MB** (brief allowed up to 10 MB; the proxy buffers ~10 MB bodies, so 8 MB leaves headroom for multipart overhead). Rules still allow 10 MB.

**D-31 Default currency INR.** New businesses now get `INR` (was a hard-coded `USD`); existing businesses keep what they have. Currency is changeable in Settings only while the business has no products (prices are stored in minor units of it).

**D-32 Role behaviour (backend-enforced).** EDITOR may create/edit products and upload media but cannot publish, archive, feature, delete, or touch categories/settings. MANAGER: full catalogue + branding, not store
publishing/settings. ADMIN/OWNER: everything (delete-business stays OWNER). Status/featured changes need `product:publish`; an EDITOR may edit a live product as long as its status/featured flag is unchanged.

**D-33 e2e isolation.** `distDir` honours `NEXT_DIST_DIR` so the e2e script runs its own dev server beside a developer's `next dev` (separate lock and cache).

**D-34 Public image caching (found by the manual regression).** Images were cached for 5 minutes, so an image still loaded from a cache after the store was unpublished. Now `max-age=60, s-maxage=60, must-revalidate` with an ETag (the immutable media id); revalidation re-runs the visibility check and returns 304 only while the asset is still public, 404 once hidden. Tested in `storefront.test.ts`.

## Nova / Everloom redesign

**D-35 Theme by token remap, not by rewriting components.** The shadcn semantic tokens are remapped to the Everloom palette and the app is dark-only, so every existing component (forms, dialogs, switches, selects) is themed without changing its behaviour.
Nova-specific looks live in a small utility layer (`.nv-*`) in `globals.css`. See `DESIGN_SYSTEM.md`.

**D-36 Nova is a visual reference only.** No prototype scripts, demo data or simulated features were imported. Prototype elements with no real counterpart (cart, command palette, live feed, search, designer) were not built; the Overview uses only real metrics.

**D-37 Storefront keeps per-business branding.** Dark businesses get the Everloom base, light businesses a light variant of the same layout; the business accent colour is kept and auto-adjusted for legibility (`legibleAccent`).

**D-38 Fonts through `next/font`.** Unbounded, Manrope and JetBrains Mono are self-hosted at build time, so the CSP did not need any new font host.
