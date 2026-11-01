/**
 * Pure description of the Firestore queries the catalogue issues. The services build their
 * queries FROM these plans, and tests/unit/indexes.test.ts asserts every plan is covered by
 * firestore.indexes.json (the emulator does not enforce indexes, production does).
 */
export const PRODUCT_SORTS = ["created", "name", "price"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export const SORT_FIELD: Record<ProductSort, string> = { created: "createdAt", name: "searchName", price: "priceCents" };

export interface ProductFilter {
  status?: "draft" | "active" | "archived";
  categoryId?: string;
  featured?: boolean;
  q?: string;
  sort?: ProductSort;
  dir?: "asc" | "desc";
}

export interface QueryPlan {
  /** Fields compared with `==` (order irrelevant). */
  equality: string[];
  /** Single orderBy field. A prefix search (`q`) forces ordering by searchName. */
  orderBy: string;
  dir: "asc" | "desc";
  /** Prefix range on searchName. */
  prefix: string | null;
}

export function normalizeSearch(q: string | undefined): string {
  return (q ?? "").trim().toLowerCase().slice(0, 60);
}

export function productQueryPlan(f: ProductFilter): QueryPlan {
  const prefix = normalizeSearch(f.q) || null;
  const equality: string[] = [];
  if (f.categoryId) equality.push("categoryId");
  if (f.status) equality.push("status");
  if (f.featured !== undefined) equality.push("featured");
  const sort = prefix ? "name" : (f.sort ?? "created");
  return { equality, orderBy: SORT_FIELD[sort], dir: f.dir ?? (sort === "created" ? "desc" : "asc"), prefix };
}

export function categoryQueryPlan(f: { active?: boolean; q?: string }): QueryPlan {
  const prefix = normalizeSearch(f.q) || null;
  return {
    equality: f.active === undefined ? [] : ["active"],
    orderBy: prefix ? "searchName" : "sortOrder",
    dir: "asc",
    prefix,
  };
}

/** Every plan shape the application can issue (used by the index-coverage test). */
export function allPlans(): QueryPlan[] {
  const out: QueryPlan[] = [];
  const statuses = [undefined, "draft", "active", "archived"] as const;
  for (const status of statuses)
    for (const categoryId of [undefined, "c"])
      for (const sort of PRODUCT_SORTS)
        for (const q of [undefined, "x"]) out.push(productQueryPlan({ status, categoryId, sort, q }));
  // storefront
  out.push(productQueryPlan({ status: "active", featured: true }));
  out.push(productQueryPlan({ status: "active" }));
  out.push(productQueryPlan({ status: "active", categoryId: "c" }));
  for (const active of [undefined, true]) for (const q of [undefined, "x"]) out.push(categoryQueryPlan({ active, q }));
  return out;
}
