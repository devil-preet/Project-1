# Development Status

_Last updated at the end of Phase 3._

## Phases
| Phase | Status |
|---|---|
| 1 Foundation (types, RBAC, rules, indexes, config) | **Complete, verified (emulators)** |
| 2 Authentication | **Complete, verified (emulators + real Chrome)** |
| 3 Business registration, tenant initialisation, onboarding | **Complete, verified (emulators + real Chrome incl. production build)** |
| 4 Dashboard (sidebar, overview metrics, business switcher) | **Next — not started** |
| 5 Categories, products, uploads, branding, settings | not started |
| 6 Team management / invitations | not started |
| 7 Security & testing hardening | partly done (rules, auth, tenancy, onboarding tests exist) |
| 8 Deployment readiness | config files drafted, **nothing deployed** |
**Nothing in this project has been verified against the real Firebase project beyond read-only probes.**

## Implemented
- Phase 2: registration, login, logout(+everywhere), verification (+resend), password reset, session cookies with revocation, CSRF, rate limiting, `proxy.ts` + nonce CSP, security headers.
- **Phase 3:** 4-step onboarding wizard (business → store identity → branding → review) with server-side resumable drafts · optional logo upload (server-side, content-sniffed) ·
  availability-checked, reserved, collision-safe store slugs · one atomic transaction creating slug + business + OWNER membership + store/branding defaults + media + user pointer ·
  idempotent/repeat-safe creation · multi-business data model (membership-based, owned-business cap 5, `?new=1` for an additional business) · business-aware dashboard
  (membership gate, active business with verified `?b=`, name + role + slug + status, list of the user's businesses) · tenant guard + rules tests for the new paths.

## Not implemented yet
Real dashboard shell/sidebar/search/notifications · business switcher UI (data model ready) · categories/products/media library/branding editor/settings (5) ·
invitations & team (6) · slug *change* flow (design only: keep old slug as `type:"redirect"`) · business deletion · onboarding checklist after creation (first category/product).
`src/lib/firebase/client.ts` (Web SDK) is still unused.

## Catalogue & Storefront milestone (built locally, not deployed)
Implemented and tested on emulators: workspace shell + business switcher + overview; categories (create/edit/delete/active/reorder/search/image/product counts); products (create/edit/delete/archive/publish, multi-image with cover, category quick-create, filters/sort/search/pagination, featured, SEO/SKU/stock);
media upload + app-served images; branding + store settings + publish toggle; read-only team list; public storefront (`/s/...`). See `ARCHITECTURE.md` and `DECISIONS.md` D-24..D-33.
Not done: team invitations/role changes, media deletion UI, product bulk actions, list-view alternative, custom domains, sitemap, image resizing/CDN, orphaned-upload cleanup job.

## Known issues / limitations
0. **Catalogue limitations:** abandoned uploads (never attached) stay in Storage/`media` until a cleanup job exists; the Phase 3 onboarding logo URL still points at Storage (the storefront uses the app route instead);
   replacing a branding logo does not delete the old file; the public image route has no CDN and no rate limit (60-second `max-age` + ETag/304 revalidation, so hiding content takes up to a minute to leave caches; every revalidation costs 3-4 Firestore reads); category `productCount` could drift only if documents are edited outside the app; branding contact details are shown publicly in the storefront footer.
1. **Firestore indexes:** deployed by the project owner (14 composites + the `members.uid` collection-group exemption); `members.uid` verified READY with `scripts/probe-prod-index.mjs`. Some composites were still building at last check - re-verify with `npx firebase firestore:indexes` before relying on catalogue list queries in production. The emulator does not enforce indexes (`tests/unit/indexes.test.ts` is the offline guard).
2. **Local security rules are not deployed** either; production rules are unknown/default. Review before storing real data.
3. Resend verification still needs `iamcredentials.googleapis.com` + token-creator role (D-10); works on emulators only.
4. `rateLimits` TTL not configured (cleanup only).
5. Abandoned onboarding drafts can leave an orphaned logo object in Storage (no cleanup job). Completed drafts keep a copy of the submitted form (`data`), incl. contact details.
6. Uploaded logo URLs are plain Storage URLs that only render if Storage rules (public read) are deployed; the UI does not display stored logos yet (preview uses a local blob).
7. Publishing a store at onboarding makes branding (incl. contact email/phone) publicly readable via rules — the UI says so; there is no unpublish flow yet.
8. Business names are not unique (by design); only slugs are.
9. No UI to delete/archive a business; the 5-owned cap can therefore be exhausted.
10. `lastBusinessId` is set at creation but not yet updated when the user switches via `?b=` (switcher arrives in Phase 4).
11. Storefront domain in the UI is the placeholder `yourplatform.com/s/`.
12. Successful logins count toward the per-IP+email login limit; `TRUSTED_PROXY_HOPS` unconfirmed for App Hosting; direct Firebase signUp bypasses our password policy (accounts reach nothing).
13. Dashboard has no `loading.tsx`/`error.tsx` boundaries yet; `npm audit` dev-tooling advisories untriaged.

## Unverified functionality
- Everything against the real project: registration/login/real email, onboarding transaction on real Firestore (contention, latency), Admin upload to the real bucket, real-Storage rules.
- Production behaviour of the collection-group query (blocked by issue 1).
- App Hosting deployment and its proxy chain / runtime service-account permissions.
- Behaviour under real load (rate limiter contention, concurrent slug claims at scale).

## External dependencies / pending approvals
1. **Deploy `firestore.indexes.json`** (+ rules) — approval required. 2. Enable IAM Credentials API + role (D-10). 3. Firestore TTL on `rateLimits.expiresAt`. 4. `npx firebase login` (deploys only).
5. Auth authorized domains / email template action URL once a domain exists. 6. Billing decisions for production (unchanged).

## Nova / Everloom redesign (done locally, not deployed)
Every existing screen was restyled to the Nova design (see `DESIGN_SYSTEM.md`) with behaviour unchanged. Added presentation-only features: Overview command center (ring, stats, bars, readiness), live storefront preview in the product form and Branding.
Known gaps: no light theme for the portal (dark-only by design); the Nova cart/command palette/live feed are intentionally absent; fonts and glow effects were verified on Chrome only.
