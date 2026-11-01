# Testing

All destructive suites run on the **Firebase Emulator Suite** under the throwaway project `demo-brand-portal`. They refuse to run if emulators are not active.
Requires a JDK on PATH. **No test in this repository has been run against the real Firebase project.** The only live contact is read-only:
`npm run verify:firebase`, `scripts/probe-prod-auth.mjs`, `scripts/probe-prod-index.mjs`, and API-state reads.

## Commands
| Purpose | Command |
|---|---|
| Typecheck / Lint | `npm run typecheck` / `npm run lint` |
| Unit (no emulator) | `npm test` |
| Firestore + Storage rules | `npm run test:rules` |
| Auth, tenant guard, onboarding (Auth+Firestore+Storage emulators) | `npm run test:integration` |
| HTTP end-to-end (boots `next dev` on the emulators) | `npm run test:e2e` |
| Production build | `npm run build` |
| Everything except build | `npm run test:all` |
| Live read-only connectivity | `npm run verify:firebase` |

## Results at end of Phase 3
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| ESLint (incl. React Compiler rules) | 0 errors, 0 warnings |
| `next build` | success; `/onboarding` + 4 `/api/onboarding/*` routes registered |
| Unit (now 7 files / **72** after adding the index-coverage guard `tests/unit/indexes.test.ts`) | 6 files, **68/68** at the time of the Phase 3 run |
| Rules (Firestore + Storage emulators) | 2 files, **54/54** |
| Integration (Auth + Firestore + Storage emulators) | 4 files, **85/85** |
| HTTP e2e | **34/34** checks |
| Real Chrome, dev server, desktop 1280 + mobile 390 (scratchpad script, not in repo) | **24/24** checks, 0 console errors/warnings |
| Real Chrome, **production build** under strict CSP, desktop | **12/12** checks, 0 console errors/warnings |
Phase 1/2 suites were re-run as regression and still pass (they are included in the counts above: Phase 2 was 50+50+42+24; Phase 3 added 18 unit, 4 rules, 43 integration, 10 e2e).

## What the Phase 3 tests prove (tests/integration/onboarding.test.ts unless noted)
- **Creation:** all 8 records written correctly (slug, business, OWNER member, store+branding defaults, user pointer, draft COMPLETED).
- **Idempotency:** sequential repeats, repeats with *different* body, and 6 concurrent identical requests → exactly one business and one membership.
- **Rollback:** a poisoned document makes the transaction fail (500); slug, business, member, settings, `lastBusinessId` are all absent, draft still IN_PROGRESS; after removing the poison the retry succeeds with the *same* reserved id.
- **Slugs:** taken slug → 409 + field error, winner untouched, loser retries; **6 users claiming one slug concurrently → exactly one 200 and five 409s**; auto-slug collisions (acme, acme-2, acme-3); reserved derived slug skipped; 5 concurrent auto requests → 5 distinct slugs; slug-check statuses.
- **Validation:** 15 invalid payloads rejected with field errors and nothing created; optional fields may be omitted.
- **Resume:** NOT_STARTED → IN_PROGRESS → COMPLETED; partial saves merge (no default injection); invalid/completed drafts rejected; drafts are per-user.
- **Multi-business:** second business via fresh draft; per-business roles; membership listing; `?b=` never trusted; soft-deleted business hidden; 5-owned cap.
- **Security:** anonymous 401 (before body parsing), unverified 403, CSRF; smuggled `role/ownerId/businessId/uid` ignored; slug takeover refused; EDITOR cannot use owner operations; editor's own onboarding never touches the owner's business.
- **Logo:** valid PNG/JPEG/WebP stored under the reserved folder and attached atomically; type detected from content; text-as-png, SVG, HTML, GIF, PDF, empty and >2 MB rejected; replace/remove deletes old object; vanished object does not block creation.
- **Rules (tests/rules):** onboarding draft unreadable/unwritable by everyone; clients cannot fabricate a tenant; slugs cannot be overwritten/deleted by anyone; cross-business member writes denied.
- **Browser:** validation errors, slug auto-derivation, taken-slug suggestion, logo preview, hex validation, live branding preview, review/edit, create → dashboard, duplicate onboarding blocked, reload resumes at saved step.

## Known limitations
- Emulator ≠ production: the emulator does **not enforce indexes** (the production project is in fact missing the `members.uid` collection-group index — see DEVELOPMENT_STATUS), has unsigned Auth tokens, no real email, and its transaction contention behaviour differs from real Firestore.
- Concurrency tests show correctness on the emulator; they are not a load test.
- Session expiry is asserted via the cookie `exp` claim, not by waiting out expiry.
- Browser scripts live outside the repo (scratchpad; `playwright-core` + system Chrome) and are not part of `npm test`.
- Real Storage (Admin upload to the real bucket) is untested; Storage rules were only exercised on the emulator.
- `npm audit` findings in dev tooling not triaged.

## Catalogue & Storefront milestone - results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| ESLint (`.next-e2e`/`.next-prod` build dirs now ignored) | 0 errors, 0 warnings |
| Unit | 8 files, **86/86** (new `catalog.test.ts`: money, validation, query plans, theme, role matrix; `indexes.test.ts` also proves every catalogue query plan has an index - shown to fail when one is removed) |
| Rules (emulator) | 2 files, **57/57** (+3: slug reservations server-only, no cross-tenant counter writes, public query surface) |
| Integration (Auth+Firestore+Storage emulators) | 6 files, **120/120** (new: `catalog.test.ts` 23, `storefront.test.ts` 12) |
| HTTP e2e (`next dev` on emulators, port 3100, `.next-e2e`) | **65/65** (was 34; +31 catalogue/storefront checks) |
| Real Chrome, **production build**, strict CSP, desktop 1280 + mobile 390 (scratchpad script, not in repo) | **52/52**, 0 console errors/warnings/CSP violations |
| Real Chrome, dev server | 51/52 on its last run; the single miss was a wrong assertion in my script (page correctly returned 404), fixed. The production run is the authoritative one |
| `next build` | success; all new routes registered |

Notes: the Chrome pass drove the UI end-to-end (category + product creation, inline category creation preserving the form, multi-image upload with cover change, filters/sort/search, edit, publish, archive, delete confirmations, anonymous storefront home/category/product pages,
brand colours, image decoding, deactivation hiding content) and screenshots were inspected - which exposed two layout bugs (mobile grid overflow, clipped card actions) that my first overflow check had missed; both were fixed and re-verified with a stricter check.
Expected 400/404 responses from deliberate negative tests are excluded from the console check (the script lists them). Everything ran on emulators/local; nothing was run against the real Firebase project.

## Nova redesign - results
| Check | Result |
|---|---|
| `tsc --noEmit` / ESLint | 0 errors / 0 warnings |
| Unit | **88/88** (+2: theme legibility and light/dark variants) |
| Rules | **57/57** |
| Integration | **121/121** |
| HTTP e2e | **65/65** (storefront/workspace checks all pass on the new markup) |
| Real Chrome, **production build**, strict CSP, desktop 1280 + mobile 390 (`catalog-browser.mjs`, scratchpad) | **52/52**, 0 console/CSP errors, no mobile horizontal overflow |
| Screenshot review (dev server, desktop + mobile, every screen incl. onboarding, auth, storefront) | all screens reviewed; 0 console errors; 0 mobile overflow |
Notes: one Chrome run failed early (category image upload step) while a previous run's processes were still alive; an immediately repeated clean run passed 52/52. I did not isolate the cause beyond that, so treat it as a possible timing flake.
The Chrome script's expectations were updated for the new copy (Overview "Launch readiness", light-theme storefront surface). Nothing was run against the real Firebase project.
