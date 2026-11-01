# Regression test prompt for the Claude Chrome extension

Copy everything below the line into the extension. Set the base URL first. It is `http://localhost:3000` if you run `npm run dev`, or your deployed URL.
It contains no secrets, and the tester must never be given any.

---

# ROLE
You are a meticulous QA engineer. Run a full regression test of a web app in this browser, using the account that is **already logged in**. Do not ask me for a password, token or key, and never print cookie or token values in your report. Work through every test case below, record PASS / FAIL / BLOCKED / N-A for each, and return the report in the format at the end.

# APP CONTEXT
**Base URL:** `http://localhost:3000` (replace if I say otherwise)

**What it is:** "System 1", a multi-tenant Business Management Portal (Next.js 16, Firebase Auth + Firestore + Storage).
- A user registers, verifies their email and logs in.
- The user then completes a 5-step onboarding wizard that creates a **business** (a tenant). The user becomes its OWNER.
- After that they land on a business-aware dashboard.
- One user can own several businesses (cap: 5).
- A storefront (System 2) and the product, category, team and settings screens are **not built yet** (see "Not built").

**Workflow summary**
1. `/register` → creates the account and sends a verification email → `/verify-email`.
2. The user clicks the email link (`/auth/action`) → email verified → `/login`.
3. `/login` sets an HttpOnly session cookie (`__session`; 14 days if "remember me", otherwise a browser-session cookie).
4. `/onboarding` is a 5-step wizard. Progress is saved as a draft (NOT_STARTED → IN_PROGRESS → COMPLETED).
5. "Complete" runs **one atomic server transaction** that creates the slug, business, OWNER membership, default store and branding settings, the optional logo, and the user's last-business pointer.
6. `/dashboard` shows the active business. Selection order: a valid `?b=<businessId>` query → the user's last business → the first membership. A `?b=` for a business the user does not belong to must be ignored.
7. `/api/auth/logout` clears the session.

**Security model to verify, not break:**
- All writes go through server API routes. They require the session cookie, the header `X-Requested-With: fetch`, a same-origin request and a JSON body (multipart for the logo).
- Every request body is limited to 16 KB.
- Unauthenticated calls must return 401. Unverified-email users must get 403 on verified-only routes.
- Rate limiting returns 429 with a `Retry-After`.
- A business id supplied by the client is never trusted. Roles are never accepted from the client.

**Routes**
- Pages: `/login`, `/register`, `/forgot-password`, `/verify-email`, `/auth/action`, `/onboarding`, `/dashboard`
- Auth API: `/api/auth/{register,login,logout,forgot-password,reset-password,verify-email,resend-verification,session}`
- Onboarding API: `/api/onboarding/{draft,logo,slug-check,complete}`

**Known and expected behaviours (do NOT report these as bugs; mark them "expected"):**
- `resend-verification` may fail (500/503). The IAM Credentials API is not enabled on the Firebase project.
- Firestore security rules in the cloud are the default deny-all. The app uses server-side Admin access, so this should not be visible.
- Phase 4+ features do not exist yet (see "Not built"). Mark them N-A.
- Placeholder store domain text such as `yourplatform.com/s/<slug>`.

# SAFETY RULES (this may be a real Firebase project)
- Treat all data as real. Do **not** delete anything, change the account's password or email, or use "sign out everywhere".
- Do **not** submit onboarding with garbage names repeatedly. Each completed onboarding creates a permanent business, and its slug is reserved forever. Create **at most 1 new business** during this run, named "QA Regression <today's date+time>". Skip creation (mark BLOCKED) if the account already owns 4 or more.
- Keep the Logout test for the very end, and re-login only if the session still works.
- For anything that needs a new account or an email inbox, mark it BLOCKED. Do not improvise.
- Do not attempt attacks beyond the listed negative tests (no brute force, no load testing).

# HOW TO COLLECT EVIDENCE
For every API call you trigger, from the UI or via `fetch()` in the page console on the app's origin, capture:
1. Method + full path
2. HTTP status
3. The JSON response body, with any token or cookie value redacted
4. Anything shown in the UI (toast, inline error, field message, redirect target)

Also record:
- Browser console errors and warnings (message plus source)
- Failed network requests (status ≥ 400, CORS/CSP blocks, or a failed route/redirect)
- Any `net::ERR_*`, a blank page, an error overlay, or a 404/500 page

When calling APIs directly use:
`fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-Requested-With":"fetch"},body:JSON.stringify(...)})`

# TEST CASES

## A. Session and route access (account already logged in)
- A1. Open `/dashboard`. It loads the dashboard (no redirect loop), greets the user by name, and shows the active business.
- A2. Open `/login`, `/register` and `/forgot-password` while logged in. Note what happens (redirect to dashboard or onboarding, or they render). Report the actual behaviour.
- A3. Open `/onboarding` while logged in. If onboarding is complete it should not allow a duplicate flow, so note the behaviour. If incomplete it should resume.
- A4. Open `/verify-email`. A verified user is redirected or told they are already verified. An unverified user sees the pending state.
- A5. `GET /api/auth/session` (or the call the app uses; check the Network tab). The response confirms the session and has no secrets. Record the shape.
- A6. Open `/dashboard` and reload 3 times. It stays logged in with no flicker or loop, and the user name is always present.
- A7. Open a nonexistent route such as `/does-not-exist`. A proper 404 page with no stack trace.

## B. Dashboard and business context (Phase 3)
- B1. The dashboard shows the business name, slug and branding (logo or initials, primary colour).
- B2. Open `/dashboard?b=<id of a business you belong to>`. It selects that business.
- B3. Open `/dashboard?b=nonexistent123` and `?b=<some other id>`. It must **ignore** it and fall back to the user's own business, with no data from another tenant and no error page.
- B4. If the user has multiple businesses, check that the active one follows the selection order above. If only one exists, mark the multi-business checks N-A.
- B5. The business list or membership lookup works. There must be **no** error mentioning `FAILED_PRECONDITION` or `COLLECTION_GROUP_ASC index` (it was fixed). Report any occurrence in full.
- B6. Check that the role shown for the owner is OWNER.

## C. Onboarding wizard (5 steps)
Use "Add another business" or the equivalent. If the UI offers no way to start a second onboarding, say so and test the API behaviour in C9 instead.
- C1. Step 1 Business basics: name (required, min length), and optional description and category. Submit empty and with invalid values. Inline errors appear and the layout does not jump.
- C2. Step 2 Store address (slug): auto-derived from the name, editable. Test an invalid slug (uppercase, spaces, symbols, too short, too long), a reserved word (`admin`, `api`, `www`), and a taken slug. Verify the live availability check, the "taken" message and the suggestion.
- C3. Step 3 Branding: logo upload. Test a valid PNG/JPG/WebP under 2 MB (preview shows), a >2 MB file (rejected), and a wrong type such as `.txt`, `.svg` or `.gif`, or a renamed text file as `.png` (rejected). Test replace and remove.
- C4. Step 3 colours: valid hex (`#1A2B3C`), invalid hex (`#GGG`, `123`), and that the live preview updates.
- C5. Step 4 Store details (contact and settings fields as shown): validation of email, phone and URL formats, and optional fields can be left empty.
- C6. Step 5 Review: all entered values are displayed and each "Edit" jumps to the right step with the values kept.
- C7. Back/Next keeps the data. Reload mid-wizard and confirm it **resumes at the saved step** with values restored.
- C8. Complete (once only, with "QA Regression <timestamp>"). Expected result:
  - success, then redirect to `/dashboard` showing the new business
  - **double-click** the final button: only one business is created
  - the new business appears with the OWNER role
  - the last-business pointer now points to the new one
- C9. API negative tests (use `fetch`):
  - `POST /api/onboarding/slug-check` with `{slug:"admin"}` → reserved or unavailable. With `{}` → 400 with field errors.
  - `POST /api/onboarding/draft` with `{role:"OWNER",ownerId:"x",businessId:"y"}` → these fields are ignored or rejected, and nothing is created for them.
  - `POST /api/onboarding/complete` without the `X-Requested-With` header → 403 (CSRF).
  - `POST /api/onboarding/complete` with a body larger than 16 KB → 413 or 400.
  - `POST /api/onboarding/complete` with `Content-Type: text/plain` → 415 or 400.
  - Completing again once COMPLETED → rejected, with no second business.

## D. Authentication API checks (using the live session)
- D1. `POST /api/auth/login` with a wrong password for **this account's** email: 401 with a generic message. Do not repeat more than twice, to avoid rate limiting. Do NOT try the real password.
- D2. `POST /api/auth/login` with `{}` or an invalid email → 400 with field errors.
- D3. `POST /api/auth/forgot-password` with a nonexistent email → the same neutral success message as for a real one (no account enumeration). Send once only.
- D4. `POST /api/auth/register` with an invalid body (weak password, bad email) → 400 with field errors. **Do not** send a valid registration.
- D5. `POST /api/auth/verify-email` and `/reset-password` with an invalid or fake code → a clear error (400), never a 500.
- D6. `POST /api/auth/resend-verification` → record the result. A 500/503 here is **expected** (mark as expected, include the body).
- D7. Cross-site check: from the console of a different origin (or an `about:blank` tab) try to POST to `/api/auth/logout`. It must be rejected (403) and the session must stay valid.
- D8. Call a protected endpoint with no `X-Requested-With` header → 403. Call it with `credentials:"omit"` → 401.

## E. Security and headers
- E1. In DevTools → Network → document response of `/dashboard`, check these headers: `Content-Security-Policy` (nonce-based `script-src`), `X-Content-Type-Options: nosniff`, `X-Frame-Options` or `frame-ancestors`, `Referrer-Policy`, `Strict-Transport-Security` (only in production). List which are present.
- E2. Application tab → Cookies: `__session` is HttpOnly and SameSite=Lax (Secure when on https). Do not print its value. `document.cookie` must NOT show it.
- E3. The console has no CSP violations during normal use.
- E4. Responses contain no stack traces, Firebase config secrets beyond the public web config, or service-account data.

## F. UI, responsive and accessibility
- F1. Desktop (~1280px) and mobile (~390px): no horizontal scroll, buttons reachable, wizard usable.
- F2. Keyboard: Tab order is logical, visible focus, Enter submits forms, Esc closes dialogs.
- F3. Labels on inputs, error messages tied to fields, readable contrast, the logo has alt text.
- F4. Light and dark theme if available. Fonts render as sans-serif.
- F5. Slow or offline: simulate the offline state while submitting a form. The UI shows a clear error and does not hang forever.

## G. Not built yet (confirm absent, mark N-A, not FAIL)
Business switcher, sidebar and navigation shell, overview metrics, categories, products, media library, team and invitations, settings pages, storefront.

## H. Logout (last)
- H1. Click logout. The session cookie is cleared, you are redirected to `/login`, and `/dashboard` now redirects to `/login`.
- H2. After logout, `GET /api/auth/session` returns 401 or an "unauthenticated" state, and `POST /api/onboarding/draft` returns 401.
- H3. Back button after logout must not show protected data.
- H4. If you can still log in as the account holder without asking me for credentials, log back in and verify the dashboard loads. Otherwise mark BLOCKED and tell me.

# REPORT FORMAT (return exactly this)
1. **Summary:** counts of PASS / FAIL / BLOCKED / N-A / EXPECTED, plus the overall verdict (SAFE TO PROCEED / ISSUES FOUND).
2. **Environment:** base URL, browser and version, viewport(s), account state seen (email verified yes/no, number of businesses, role), timestamp.
3. **Results table:** `ID | Test | Result | Notes`.
4. **Failures and errors in detail.** For every FAIL, or any unexpected error, give:
   - Test ID and the steps to reproduce
   - Expected vs actual
   - Exact request: method, URL, request headers (redacted), body
   - Exact response: HTTP status and full JSON body
   - UI message shown, plus the redirect or route that happened
   - Console errors and warnings, verbatim, with source file and line
   - Failed network requests list (URL, status, type)
   - A screenshot description or reference
   - Your suspected cause (frontend, API, auth, rate limit, CSP, index/Firestore)
5. **Warnings and observations** that are not failures (slow calls over 2s, layout jank, confusing copy, accessibility gaps).
6. **Data created** by this run (business name, slug) so I can clean it up.
7. **Not tested / blocked** and why.

Be precise. Quote error text exactly, never summarise it as "an error occurred". If a test cannot be run, say why instead of skipping it silently.
