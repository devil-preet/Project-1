/** URL-safe slug: lowercase ascii, digits, single hyphens. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Slugs that must never be claimed by a tenant (future subdomain/route collisions). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin", "api", "app", "auth", "dashboard", "login", "register", "www", "mail",
  "support", "help", "static", "assets", "cdn", "store", "shop", "settings",
  "billing", "status", "docs", "blog", "portal", "onboarding", "s", "new", "null",
  "undefined", "about", "contact", "terms", "privacy", "pricing", "team", "home", "test",
]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 48 && SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** Candidate generator for collision retries: base, base-2, base-3 … */
export function slugCandidate(base: string, attempt: number): string {
  const root = base || "business";
  return attempt <= 1 ? root : `${root.slice(0, 44)}-${attempt}`;
}
