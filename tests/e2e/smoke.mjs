// End-to-end smoke test: boots the real Next.js app against the Firebase
// emulators and drives it over HTTP. Run: npm run test:e2e
import { spawn } from "node:child_process";

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: emulators are not active. Use `npm run test:e2e`.");
  process.exit(2);
}

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const PROJECT = "demo-brand-portal";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT)], {
  env: {
    ...process.env,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
    GCLOUD_PROJECT: PROJECT,
    NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
    NEXT_PUBLIC_APP_URL: BASE,
    FIREBASE_SERVICE_ACCOUNT_JSON: "",
    NEXT_DIST_DIR: ".next-e2e",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  -> ${detail}`}`);
}

const get = (path, cookie) =>
  fetch(BASE + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
const post = (path, body, cookie, extra = {}) =>
  fetch(BASE + path, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      origin: BASE,
      "sec-fetch-site": "same-origin",
      "x-requested-with": "fetch",
      "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
    body: JSON.stringify(body),
  });
const loc = (res) => res.headers.get("location") ?? "";
const cookieOf = (res) => (res.headers.get("set-cookie")?.match(/__session=([^;]+)/) ? `__session=${res.headers.get("set-cookie").match(/__session=([^;]+)/)[1]}` : null);

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE + "/login", { redirect: "manual" })).status === 200) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error("server did not become ready\n" + serverLog.slice(-2000));
}

try {
  await waitReady();

  // --- unauthenticated ---
  let r = await get("/dashboard");
  check("proxy: /dashboard without cookie -> /login?next=/dashboard", r.status === 307 && loc(r).includes("/login?next=%2Fdashboard"), `${r.status} ${loc(r)}`);
  r = await get("/");
  check("/ redirects anonymous to /login", [307, 308].includes(r.status) && loc(r).endsWith("/login"), `${r.status} ${loc(r)}`);
  r = await get("/login");
  const html = await r.text();
  check("/login renders the sign-in form", r.status === 200 && html.includes("Welcome back"));
  check("security headers present", r.headers.get("x-frame-options") === "DENY" && r.headers.get("x-content-type-options") === "nosniff");
  check("no X-Powered-By leak", !r.headers.get("x-powered-by"));
  r = await get("/register");
  check("/register renders", r.status === 200 && (await r.text()).includes("Create your account"));
  r = await get("/forgot-password");
  check("/forgot-password renders", r.status === 200);

  // --- forged cookie: proxy lets it through, server-side verification must reject it ---
  r = await get("/dashboard", "__session=forged.value.here");
  check("layout independently rejects a forged session cookie", r.status === 307 && loc(r).endsWith("/login"), `${r.status} ${loc(r)}`);
  r = await get("/verify-email", "__session=forged");
  check("verify-email rejects a forged cookie", r.status === 307 && loc(r).endsWith("/login"), `${r.status} ${loc(r)}`);

  // --- CSRF on the real server ---
  r = await post("/api/auth/login", { email: "a@b.co", password: "x" }, null, { "x-requested-with": "" });
  check("API rejects request without X-Requested-With (403)", r.status === 403, String(r.status));
  r = await post("/api/auth/login", { email: "a@b.co", password: "x" }, null, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
  check("API rejects cross-site request (403)", r.status === 403, String(r.status));

  // --- register -> unverified flow ---
  const email = "e2e@example.com";
  const pw = "Str0ngPassw0rdX";
  r = await post("/api/auth/register", { fullName: "Eve Tester", email, password: pw, confirmPassword: pw });
  const cookie = cookieOf(r);
  check("register succeeds and sets session cookie", r.status === 200 && !!cookie, String(r.status));
  check("session cookie is HttpOnly + SameSite=Lax", /httponly/i.test(r.headers.get("set-cookie") ?? "") && /samesite=lax/i.test(r.headers.get("set-cookie") ?? ""));

  r = await get("/dashboard", cookie);
  check("unverified user is bounced from /dashboard to /verify-email", r.status === 307 && loc(r).endsWith("/verify-email"), `${r.status} ${loc(r)}`);
  r = await get("/verify-email", cookie);
  check("verify-email page shows the user's address", r.status === 200 && (await r.text()).includes(email));
  r = await get("/login", cookie);
  check("signed-in (unverified) user is redirected away from /login", r.status === 307 && loc(r).endsWith("/verify-email"), `${r.status} ${loc(r)}`);

  // --- verify via emailed code, using the action page + API ---
  const codes = await (await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/oobCodes`)).json();
  const verify = codes.oobCodes.find((c) => c.email === email && c.requestType === "VERIFY_EMAIL");
  check("verification email was issued", !!verify);
  r = await get(`/auth/action?mode=verifyEmail&oobCode=${verify.oobCode}`);
  check("/auth/action renders for verifyEmail", r.status === 200 && (await r.text()).includes("Verify your email"));
  r = await post("/api/auth/verify-email", { oobCode: verify.oobCode });
  check("verify-email API accepts the code", r.status === 200, String(r.status));

  // --- tenant gate: verified but no business yet -> onboarding ---
  r = await get("/dashboard", cookie);
  check("verified user with no business is sent from /dashboard to /onboarding", r.status === 307 && loc(r).endsWith("/onboarding"), `${r.status} ${loc(r)}`);
  r = await get("/onboarding", cookie);
  const onb = (await r.text()).replace(/<!-- -->/g, "");
  check("/onboarding renders the wizard for a user without a business", r.status === 200 && onb.includes("set up your business"), `${r.status}`);
  r = await get("/onboarding");
  check("/onboarding without a session redirects to /login", r.status === 307 && loc(r).includes("/login"), `${r.status} ${loc(r)}`);

  r = await post("/api/onboarding/complete", { businessName: "E2E Brand", industry: "Other", storeDisplayName: "E2E Brand", slug: "e2e-brand" });
  check("onboarding API rejects an anonymous caller (401)", r.status === 401, String(r.status));
  r = await post("/api/onboarding/draft", { step: 1, data: { businessName: "E2E Brand" } }, cookie);
  check("draft saves for a verified session", r.status === 200, String(r.status));
  r = await post("/api/onboarding/complete", { businessName: "E2E Brand", industry: "Other", storeDisplayName: "E2E Brand", slug: "e2e-brand", role: "ADMIN", businessId: "forged" }, cookie);
  const created = await r.json();
  check("business is created (smuggled role/businessId ignored)", r.status === 200 && created.created === true && created.slug === "e2e-brand" && created.businessId !== "forged", JSON.stringify(created));
  r = await post("/api/onboarding/complete", { businessName: "E2E Brand", industry: "Other", storeDisplayName: "E2E Brand", slug: "e2e-brand" }, cookie);
  const again = await r.json();
  check("repeating the request is idempotent (same business, created=false)", again.businessId === created.businessId && again.created === false, JSON.stringify(again));

  r = await get("/dashboard", cookie);
  const dash = (await r.text()).replace(/<!-- -->/g, "");
  check("dashboard shows the business name and the Owner role", r.status === 200 && dash.includes("E2E Brand") && dash.includes("Owner"), `${r.status}`);
  r = await get("/onboarding", cookie);
  check("a user who already has a business is redirected from /onboarding to /dashboard", r.status === 307 && loc(r).endsWith("/dashboard"), `${r.status} ${loc(r)}`);
  r = await get("/onboarding?new=1", cookie);
  check("/onboarding?new=1 allows starting an additional business", r.status === 200);
  r = await get("/dashboard?b=someone-elses-business-id", cookie);
  const denied = (await r.text()).replace(/<!-- -->/g, "");
  check("?b= for a business the user does not belong to is ignored (own business shown, no leak)", r.status === 200 && denied.includes("E2E Brand") && denied.includes("isn&#x27;t available"), `${r.status}`);
  r = await get("/login", cookie);
  check("verified user is redirected from /login to /dashboard", r.status === 307 && loc(r).endsWith("/dashboard"), `${r.status} ${loc(r)}`);
  r = await get("/auth/action?mode=nope");
  check("/auth/action with bad params shows an error, not a crash", r.status === 200 && (await r.text()).includes("invalid or incomplete"));

  // --- catalogue + storefront (milestone 5) ---
  const bizId = created.businessId;
  for (const page of ["overview", "products", "categories", "products/new", "media", "team", "branding", "settings"]) {
    r = await get(`/b/${bizId}/${page}`, cookie);
    check(`workspace /b/{id}/${page} renders for the owner`, r.status === 200, String(r.status));
  }
  r = await get(`/b/${bizId}/overview`);
  check("workspace routes redirect anonymous visitors to /login", r.status === 307 && loc(r).includes("/login"), `${r.status} ${loc(r)}`);
  r = await get("/b/not-my-business/overview", cookie);
  check("a business the user does not belong to is a 404, not a leak", r.status === 404, String(r.status));

  const api = (p, body) => post(`/api/b/${bizId}/${p}`, body, cookie);
  r = await api("categories", { action: "create", name: "T-Shirts" });
  const category = (await r.json()).category;
  check("category created via API", r.status === 200 && category?.slug === "t-shirts", String(r.status));
  r = await post("/api/b/not-my-business/categories", { action: "create", name: "Nope" }, cookie);
  check("category API refuses a business the user does not belong to", r.status === 403, String(r.status));

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const up = async () => {
    const form = new FormData();
    form.set("file", new File([png], "p.png", { type: "image/png" }));
    const res = await fetch(`${BASE}/api/b/${bizId}/media`, {
      method: "POST", body: form, redirect: "manual",
      headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin", "x-requested-with": "fetch", "x-forwarded-for": "10.8.1.1" },
    });
    return res;
  };
  r = await up();
  const media = (await r.json()).media;
  check("image upload accepted (PNG by content)", r.status === 200 && !!media?.mediaId, String(r.status));
  r = await get(media.url, cookie);
  check("uploaded image is previewable by a member", r.status === 200 && r.headers.get("content-type") === "image/png", String(r.status));
  r = await get(media.url);
  check("the members-only image route refuses anonymous visitors", r.status === 401, String(r.status));

  r = await api("products", { action: "create", product: { name: "Live Tee", categoryId: category.id, description: "Soft cotton.", priceCents: 49900, imageIds: [media.mediaId], status: "active" } });
  const live = (await r.json()).product;
  check("product published with an image", r.status === 200 && live?.status === "active", String(r.status));
  r = await api("products", { action: "create", product: { name: "Draft Tee", categoryId: category.id, description: "Soon.", priceCents: 100 } });
  const draftP = (await r.json()).product;
  check("draft product created", r.status === 200 && draftP?.status === "draft");
  r = await api("products", { action: "create", product: { name: "Bad", categoryId: category.id, description: "x", priceCents: 9.99 } });
  check("float price rejected with a field error", r.status === 400 && (await r.json()).fieldErrors?.priceCents?.length > 0);

  r = await get("/s/e2e-brand");
  check("storefront is hidden (404) while the store is unpublished", r.status === 404, String(r.status));
  r = await api("settings", { action: "publish", published: true });
  check("store published through the settings API", r.status === 200, String(r.status));

  r = await get("/s/e2e-brand");
  const shop = (await r.text()).replace(/<!-- -->/g, "");
  check("storefront home is public and lists the live product only", r.status === 200 && shop.includes("Live Tee") && !shop.includes("Draft Tee"), String(r.status));
  check("storefront sends the strict CSP and security headers", (r.headers.get("content-security-policy") ?? "").includes("nonce-") && r.headers.get("x-frame-options") === "DENY");
  r = await get("/s/e2e-brand/category/t-shirts");
  const catPage = (await r.text()).replace(/<!-- -->/g, "");
  check("category page lists live products, hides drafts", r.status === 200 && catPage.includes("Live Tee") && !catPage.includes("Draft Tee"), String(r.status));
  r = await get(`/s/e2e-brand/product/${live.slug}`);
  const detail = (await r.text()).replace(/<!-- -->/g, "");
  check("product detail page shows price, availability and category", r.status === 200 && detail.includes("499") && detail.includes("In stock") && detail.includes("T-Shirts"), String(r.status));
  r = await get(`/s/e2e-brand/product/${draftP.slug}`);
  check("draft product detail is a 404", r.status === 404, String(r.status));
  r = await get("/s/unknown-store");
  check("unknown storefront slug is a 404", r.status === 404, String(r.status));
  r = await get(`/api/public/media/${bizId}/${media.mediaId}`);
  check("public image route serves the live product's image to anonymous visitors", r.status === 200 && r.headers.get("content-type") === "image/png", String(r.status));
  r = await api("categories", { action: "setActive", id: category.id, active: false });
  check("category deactivated", r.status === 200);
  r = await get(`/s/e2e-brand/product/${live.slug}`);
  check("products in an inactive category disappear from the storefront immediately", r.status === 404, String(r.status));
  r = await get("/s/e2e-brand/category/t-shirts");
  check("inactive category page is a 404", r.status === 404, String(r.status));
  r = await get(`/api/public/media/${bizId}/${media.mediaId}`);
  check("and its image stops being public", r.status === 404, String(r.status));

  // --- revocation ---
  await sleep(1100);
  r = await post("/api/auth/logout", { everywhere: true }, cookie);
  check("logout everywhere succeeds and clears cookie", r.status === 200 && /max-age=0/i.test(r.headers.get("set-cookie") ?? ""));
  r = await get("/dashboard", cookie);
  check("a revoked session is rejected by the server even though the cookie is still presented", r.status === 307 && loc(r).endsWith("/login"), `${r.status} ${loc(r)}`);
} catch (e) {
  check("script completed without exception", false, String(e?.stack ?? e));
} finally {
  server.kill();
  await sleep(500);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log("Server log tail:\n" + serverLog.slice(-1500));
process.exit(failed.length ? 1 : 0);
