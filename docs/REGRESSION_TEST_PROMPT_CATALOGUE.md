# Regression + data-seeding prompt for the Claude Chrome extension (catalogue and storefront)

Copy everything below the line into the extension. Set the base URL first. It is `http://localhost:3000` while you run `npm run dev` against the real Firebase project, or your deployed URL.

**How I read your request:** at least **5 categories** and **at least 10 products in each category** (so 50+ products) in **each** of two businesses: your **existing** business and **one new** business. That is about 100+ real records.
If you meant 10 products in total per business, change "10 per category" in section 3 to "10 per business".

---

# ROLE
You are a meticulous QA engineer. In this browser, with the account that is **already logged in**, (1) run a regression test of the latest functionality of a multi-tenant business portal and public storefront, and (2) seed realistic catalogue data in two businesses while doing it. Never ask me for a password, token or key, and never print cookie or token values. Record PASS / FAIL / BLOCKED / N-A / EXPECTED for every test, and return the report in the format at the end.

# APP CONTEXT
**Base URL:** `http://localhost:3000` (replace if I say otherwise). Stack: Next.js + Firebase (Auth, Firestore, Storage). **This is a real project: everything you create is real data.**

**Workflow in one paragraph:** log in, then `/dashboard` lists my businesses and has an "Open workspace" button. Each business has a workspace at `/b/{businessId}/…` with Overview, Products, Categories, Branding, Media, Team, Settings. Owners create categories and products there (a product needs a category; it can be saved as a **draft** without an image, but **publishing needs at least one image**). Settings has a **"Store published"** switch. When published, a public storefront (no login) is available at `/s/{slug}` with category pages `/s/{slug}/category/{categorySlug}` and product pages `/s/{slug}/product/{productSlug}`. Only **live** (active) products in **active** categories are public; drafts, archived products, and products in a hidden category are 404 / absent. A new business is created in the onboarding wizard at `/onboarding?new=1`.

**Pages:** `/login`, `/dashboard`, `/onboarding?new=1`, `/b/{id}/overview|products|products/new|products/{productId}|categories|branding|media|team|settings`, `/s/{slug}…`
**APIs (JSON POST, need header `X-Requested-With: fetch`, same origin, session cookie):** `/api/b/{id}/categories` (actions create|update|delete|setActive|move), `/api/b/{id}/products` (create|update|delete|setStatus), `/api/b/{id}/settings` (store|publish|branding), `/api/b/{id}/media` (multipart upload, field `file`), `GET /api/b/{id}/media/{mediaId}` (members only), `GET /api/public/media/{id}/{mediaId}` (public, only visible images), plus `/api/onboarding/*` and `/api/auth/*`.

**Business rules to verify (not bugs):**
- Prices are integers in minor units (the UI takes `499.50`; the API takes `49950`). Floats and negatives are rejected. Compare-at price must be higher than the price.
- Category and product URL names (slugs) are unique **within a business**: a duplicate name gets `-2`, `-3`; an explicit duplicate slug gives 409 `slug_taken`.
- A category with products cannot be deleted (409 `conflict`, message says to move or delete the products).
- Currency is locked once a business has products. Existing businesses were created with **USD**; a new business defaults to **INR**. **Do not change currency** on an existing business.
- Images: PNG/JPEG/WebP only, up to 8 MB, type is detected from file content. Up to 10 images per product; the first is the cover.
- Hiding a category (switch "Visible") hides its page, its products and its images on the storefront immediately.
- A store that is not published returns 404 for every `/s/{slug}` page.
- The branding contact email/phone appear in the public footer (intended).

**Known and expected (mark EXPECTED, not FAIL):** team invitations and role changes do not exist yet (Team is a read-only list); `resend-verification` may fail until an IAM API is enabled; dev mode (`next dev`) can be slow on first load of a page (up to ~10 s); you only have one account, so **other roles (Admin/Manager/Editor) cannot be tested: mark N-A**.

# SAFETY RULES
- Create data **only** as specified. Prefix every product and category name you create with `QA ` (for example `QA Linen Shirt`) so I can find and delete them. Do not edit or delete anything that existed before your run (the existing products/categories, if any), except to test with items you created yourself.
- Do not change the account's email, password or settings of existing businesses other than: publishing/unpublishing the store (restore it to the state you found it in at the end) and the items you create.
- Create **exactly one** new business (name `QA Catalog <date-time>`, store address `qa-catalog-<mmdd-hhmm>`). The slug is permanent. If the account already owns 5 businesses, mark that part BLOCKED.
- Do not log out until the very end. No load or brute-force tests. Keep to the rate limits: at most ~250 write requests per 10 minutes and ~50 image uploads per 10 minutes per business. If you get 429, wait the `Retry-After` time.
- Do not use "sign out everywhere".

# EVIDENCE TO COLLECT
For every failure or unexpected response record: method + path, request body (redact secrets), HTTP status, **full JSON response body**, UI message shown, redirect/route reached, browser console errors/warnings (verbatim), failed network requests (URL, status), and a screenshot reference. Quote errors exactly.
When using `fetch` from the console on the app origin use:
`fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-Requested-With":"fetch"},body:JSON.stringify(body)})`

# 1. START
1. Open `/dashboard`. Record: how many businesses I have, their names, ids (from the "Open workspace" link / switcher), slugs, whether each store is published, and the role shown. Pick the **existing business** to use as **Business A** (use the one named in my message if I name one, otherwise the first). Note whether Business A's store is currently published.
2. Open Business A's workspace: `/b/{idA}/overview`. Record the counts shown (categories, products) before you start.

# 2. THE DATA SET
Use these 5 categories. Create 10 products in each (names below); descriptions can be one sentence; vary prices; make 2 of the 10 in each category **featured** (More options switch), set **stock** on 3 of them, put an **SKU** (`QA-<CAT>-<nn>`) on all of them, set one product per category **out of stock**, one per category with a **compare-at price** (higher than price), and leave 2 per category as **drafts** (the others live, if images can be uploaded; see section 3).

| Category | 10 products (all prefixed "QA ") |
|---|---|
| QA Kurtas | Block-print Kurta, Chikankari Kurta, Linen Kurta, Silk Kurta, Cotton Short Kurta, Festive Kurta, Straight Kurta, Anarkali Kurta, Pathani Kurta, Printed Kurta |
| QA Sarees | Banarasi Saree, Kanjivaram Saree, Chanderi Saree, Cotton Saree, Linen Saree, Georgette Saree, Tussar Saree, Bandhani Saree, Ikat Saree, Printed Saree |
| QA Dupattas | Phulkari Dupatta, Chanderi Dupatta, Mirror-work Dupatta, Silk Dupatta, Cotton Dupatta, Bandhani Dupatta, Net Dupatta, Embroidered Dupatta, Linen Dupatta, Printed Dupatta |
| QA Accessories | Leather Tote, Jute Bag, Silk Scarf, Wool Shawl, Brass Earrings, Beaded Necklace, Wooden Bangles, Cotton Stole, Canvas Pouch, Handloom Belt |
| QA Home Textiles | Cotton Bedsheet, Block-print Cushion Cover, Handwoven Rug, Table Runner, Linen Napkins, Quilted Throw, Curtain Panel, Cotton Towel Set, Kantha Blanket, Cotton Tablecloth |

Prices: any integer rupee/dollar amounts between 99 and 15,999 with `.00` or `.50` decimals (for example `1299.50`). Give two products in the whole set a deliberately long name (about 100 characters) and one a description of about 2000 characters to test long content.

# 3. HOW TO SEED (do it for Business A, then again for the new Business B)
**Be efficient:** create the first category and the first 2 products in each category **through the UI** (these double as UI tests, see section 4). For the rest you may use the API calls from the page console on the same origin.
API bodies:
- Category: `{"action":"create","name":"QA Kurtas","description":"...","active":true,"imageId":null}` returns `{ok:true,category:{id,slug,...}}`.
- Product: `{"action":"create","product":{"name":"QA Linen Kurta","categoryId":"<id>","description":"...","shortDescription":"...","priceCents":129950,"compareAtPriceCents":null,"sku":"QA-KUR-03","stockQuantity":5,"availability":"in_stock","featured":false,"imageIds":["<mediaId>"],"status":"active"}}`. For a draft use `"status":"draft"` and `"imageIds":[]`.
- Upload: multipart `POST /api/b/{id}/media`, form field `file`; returns `{ok:true,media:{mediaId,url}}`.

**Images:** publishing needs at least one image. If you can attach files to the page's file inputs (or generate image files in the page and upload them with `fetch`/`FormData`, for example by drawing different coloured squares on a canvas and exporting PNG), give every non-draft product 1 image and at least 3 products per category 2–3 images. Reuse one uploaded image **only once**: an image can belong to one product, so upload a fresh file per product (small ~5–50 KB PNGs are fine). **If you cannot supply image files at all**, still create all products as drafts and mark the "live storefront" tests for the unpublishable ones BLOCKED; then try to prove the publish rule once by attempting to publish a product without an image (expected to be refused). State clearly in the report which situation applied.

After seeding Business A, verify its counts: Overview should show ≥5 categories and ≥50 products (plus whatever existed). Each category card should show "10 products" (or 10 + pre-existing).

**Business B (new):** create it at `/onboarding?new=1` through all wizard steps (business name `QA Catalog <date-time>`, industry any, store name, slug `qa-catalog-<mmdd-hhmm>`, description, a logo is optional, colours any valid hex), complete it, and confirm you land on its dashboard and workspace (note: its default currency should be INR). Then publish its store in Settings and repeat the whole seeding. Business A may stay as you found it afterwards (see section 5).

# 4. REGRESSION TESTS (run while seeding; each gets a result)

**A. Session and access**
- A1 `/dashboard` loads, lists all businesses with roles, "Open workspace" opens `/b/{id}/overview`.
- A2 Business switcher (the business name dropdown in the workspace header) lists every business and switches between them; "+ New business" goes to `/onboarding?new=1`.
- A3 `/login`, `/register` while logged in redirect to the dashboard.
- A4 Opening `/b/not-a-real-id/overview` returns 404 (no data, no stack trace). Opening Business B's pages with Business A's id mixed into a product URL (`/b/{idA}/products/{productIdFromB}`) returns 404.

**B. Workspace shell**
- B1 All nav items (Overview, Products, Categories, Branding, Media, Team, Settings) open without errors; the active item is highlighted.
- B2 Overview counts and the "Getting started" checklist update correctly after seeding; "View store" appears only when published.

**C. Categories (UI)**
- C1 Empty state (Business B only, before first category) offers "Create your first category".
- C2 Create with name `x` shows an inline validation error and does not create it. Create valid categories with and without an image (upload a PNG in the dialog); the card shows image, name, description, status and "N products".
- C3 Duplicate name: creating "QA Kurtas" twice gives slug `qa-kurtas` then `qa-kurtas-2`; an explicit duplicate in Advanced → URL name is refused with an inline message.
- C4 Edit a category (name/description); the change persists after reload.
- C5 Reorder with Move up / Move down changes the order, persists after reload, and the first/last buttons are disabled correctly.
- C6 Search "qa k" filters by name prefix, case-insensitively; clearing restores the list.
- C7 Visible switch: turn **off** one category (not the main ones), confirm its badge becomes "Hidden"; keep it off for the storefront test, then turn it back on.
- C8 Delete: deleting a category that has products shows the explanatory dialog and does **not** delete it. Delete only a **QA test category you create for this purpose with zero products** (`QA Temp`), with the confirmation step; verify it is gone and that re-creating "QA Temp" gets the slug `qa-temp` again.

**D. Products (UI)**
- D1 Empty form: "Save as draft" shows inline errors for name, category, description, price.
- D2 Publish without image shows "Add at least one image before publishing" and does not save.
- D3 Price validation: `abc`, `-5`, `12.345`, `1e3`, compare-at ≤ price are rejected with a clear message; `0` is accepted; `1299.50` is saved as ₹/$1,299.50 on the card.
- D4 **Category quick-create** from the product form ("+ New" next to Category): create `QA Temp 2`; it is selected automatically and **everything already typed in the form is still there** (name, description, price); the product form did not submit.
- D5 Image upload: a `.txt` or `.svg` file is refused; two PNGs upload with progress; the first is the Cover; "Cover" on the second makes it the cover; Remove works before saving.
- D6 More options: SKU, stock, availability, compare-at, URL name, SEO fields, Featured switch all save and reload correctly.
- D7 Product cards show image, name, category, price, availability, status badge, Edit / Publish / Unpublish / Archive / Delete.
- D8 Filters and sort (use the full seeded set): by category; by status (Live, Draft, Archived); search `qa b` (prefix); sort Newest, Oldest, Name A–Z, Name Z–A, Price low–high, Price high–low (verify the order of the first 5 results is actually correct); combine category + status + sort.
- D9 **Pagination:** with ≥25 products, a "Next page" link appears; page through all pages; no product is missing or repeated (count them: category filter totals must match "10 per category").
- D10 Edit a product: rename, change category (the old category's product count decreases by 1, the new one's increases by 1 on the Categories page), save, reload.
- D11 Archive one QA product (confirmation dialog) and restore it by editing → "Save & publish"; Unpublish/Publish buttons on the card work; Publish is disabled with a tooltip for a product without an image.
- D12 Delete: delete only a `QA Temp` product that you create for this purpose, with the confirmation; the category count goes down by 1; its URL name becomes reusable.
- D13 Long name (~100 chars) and long description (~2000 chars) save and render without breaking the layout.

**E. Branding, Media, Team, Settings**
- E1 Branding: change the primary colour to another valid hex, save, reload (persists); an invalid hex is refused. (In Business B only. Restore the colour in Business A if you changed it.)
- E2 Media: the library shows the uploaded images with their usage ("product", "category", "unused"); every image loads (not broken).
- E3 Team: lists the members with the role badge "Owner".
- E4 Settings: store name/description save; the currency selector is **disabled** (locked) in a business with products; in the new business before products exist it is editable and defaults to INR. Publish switch toggles with a confirmation message.

**F. Public storefront (open in a private/incognito tab or a context with no login)**
For each of Business A and Business B once published:
- F1 `/s/{slug}` shows the hero, "Shop by category" tiles for every **visible** category, Featured products, Latest products with real images, footer with the store name. Brand colours are applied.
- F2 Only live products appear; drafts and archived products do not (spot-check 3 draft names: they must not appear anywhere, including search-engine-style direct URLs).
- F3 `/s/{slug}/category/{categorySlug}`: shows the category's live products, the sort control works (Newest / price both ways / name), and "Show more" pages through when there are more than 12 products.
- F4 `/s/{slug}/product/{productSlug}`: name, price (and struck-through compare-at where set), In stock / Out of stock, short and full description, SKU, category link, image gallery (thumbnails switch the main image), breadcrumb, "You may also like".
- F5 The product URL of a **draft** product returns 404; an **archived** product returns 404; an unknown slug `/s/does-not-exist` returns 404 (no stack trace).
- F6 Hide a category (switch Visible off) → its category page and **all its products' pages** are 404 within a few seconds and the tile disappears from the home page; image URLs of those products (`/api/public/media/…`) return 404. Turn it back on and confirm everything returns.
- F7 Unpublish the store in Settings → every `/s/{slug}` page and image URL is 404. Republish.
- F8 Open a few image URLs directly in a private tab: live product images return 200 `image/png|jpeg|webp`; the images of a draft product return **404**; the **members-only** URL `/api/b/{id}/media/{mediaId}` returns 401 when not logged in.
- F9 The storefront page makes no failed requests and the console is clean.

**G. Security and tenancy (negative tests, a few requests each; do not repeat)**
- G1 From the console, `POST /api/b/{idA}/categories` without the `X-Requested-With` header → 403 `csrf`.
- G2 `POST /api/b/{idB}/products` with a category id that belongs to the other business → 400 field error on `categoryId`.
- G3 Create a product with an image id that belongs to another product → 400 (`imageIds`). A product with a float price (`9.99`) → 400 `priceCents`.
- G4 `POST /api/b/not-my-business/categories` → 403 (no information leaked).
- G5 Uploading a text file renamed `.png` → 400. A body larger than 16 KB to a JSON endpoint → 400.
- G6 No response contains stack traces, other users' data, member emails of other businesses, or storage paths on the public storefront (look at the HTML source of `/s/{slug}` and a product page).
- G7 Security headers on `/s/{slug}` and `/b/{id}/overview`: `Content-Security-Policy` (nonce), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. In `next dev`, `unsafe-eval` in the CSP is expected.

**H. Responsive and accessibility (spot checks)**
- H1 At 1280 px and at 390 px (use responsive/device emulation): no horizontal scrolling on workspace pages and storefront pages; the nav is reachable on mobile; product cards, forms and dialogs are usable.
- H2 Keyboard: Tab order is logical, focus is visible, Enter submits dialogs, Esc closes them; inputs have labels; images have alt text.

# 5. END STATE
- Leave all QA categories and products in place (I will review/delete them). Restore Business A's published/unpublished state and colours to what you found at the start.
- Finally log out: `/login` is shown and `/b/{id}/overview` redirects to `/login`. (Do not try to log back in.)

# REPORT FORMAT (return exactly this)
1. **Summary:** counts of PASS / FAIL / BLOCKED / N-A / EXPECTED; overall verdict (SAFE TO PROCEED / ISSUES FOUND).
2. **Environment:** base URL, browser + version, viewports tested, account state (email verified, businesses and roles), timestamp, whether dev or production build, whether images could be uploaded.
3. **Data created (table):** for Business A and Business B: business name, id, slug, store URL; then for each category: name, id, slug, number of products created, how many live / draft / featured / with images. Total categories and products created per business. Any product that failed to create and why.
4. **Results table:** `ID | Test | Result | Notes`.
5. **Failures and errors in detail.** For every FAIL or unexpected error: test ID, steps to reproduce, expected vs actual, exact request (method, URL, headers redacted, body), exact response (status + full JSON), UI message, redirect, console errors/warnings verbatim, failed network requests, screenshot reference, suspected cause (frontend, API, auth, rate limit, CSP, Firestore index, Storage).
6. **Warnings and observations:** slow calls (>2 s in production, >10 s in dev), layout glitches, confusing copy, accessibility gaps, anything you saw in the console even if the test passed.
7. **Not tested / blocked** and why (for example roles that cannot be tested with one account).
8. **Cleanup list:** every record created (names + ids) so I can remove it.

Be precise. Quote error messages exactly. If something cannot be done, say why instead of skipping it silently.
