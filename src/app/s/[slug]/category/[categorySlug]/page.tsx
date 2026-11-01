import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyShelf, ProductGrid } from "@/components/storefront/parts";
import { idSchema } from "@/lib/validations/catalog";
import { getPublicCategoryBySlug, getPublicStore, listPublicProducts } from "@/services/public-store.service";

type Props = {
  params: Promise<{ slug: string; categorySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORTS = {
  newest: { sort: "created", dir: "desc", label: "Newest" },
  "price-asc": { sort: "price", dir: "asc", label: "Price: low to high" },
  "price-desc": { sort: "price", dir: "desc", label: "Price: high to low" },
  name: { sort: "name", dir: "asc", label: "Name A–Z" },
} as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, categorySlug } = await params;
  const store = await getPublicStore(slug);
  const cat = store ? await getPublicCategoryBySlug(store, categorySlug) : null;
  return store && cat ? { title: `${cat.name} · ${store.name}`, description: cat.description || undefined } : { title: "Not found" };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug, categorySlug } = await params;
  const store = await getPublicStore(slug);
  if (!store) notFound();
  // Inactive / unknown categories are a plain 404, so their products are not exposed through this route.
  const category = await getPublicCategoryBySlug(store, categorySlug);
  if (!category) notFound();

  const sp = await searchParams;
  const sortKey = typeof sp.sort === "string" && sp.sort in SORTS ? (sp.sort as keyof typeof SORTS) : "newest";
  const cursor = typeof sp.after === "string" && idSchema.safeParse(sp.after).success ? sp.after : undefined;
  const { sort, dir } = SORTS[sortKey];
  const page = await listPublicProducts(store, { categoryId: category.id, sort, dir, cursor, limit: 12 });
  const base = `/s/${store.slug}/category/${category.slug}`;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm opacity-70">
        <Link href={`/s/${store.slug}`} className="hover:underline">Home</Link> <span aria-hidden>/</span> <span>{category.name}</span>
      </nav>
      <header className="mb-8 overflow-hidden rounded-2xl bg-[var(--sf-primary)] text-[var(--sf-primary-fg)]">
        <div className="relative px-6 py-10 sm:px-10">
          {category.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={category.image.url} alt="" className="absolute inset-0 size-full object-cover opacity-25" />
          )}
          <div className="relative">
            <h1 className="text-3xl font-bold tracking-tight">{category.name}</h1>
            {category.description && <p className="mt-2 max-w-2xl opacity-85">{category.description}</p>}
          </div>
        </div>
      </header>

      <form action={base} className="mb-6 flex items-center justify-end gap-2 text-sm">
        <label htmlFor="sort" className="opacity-70">Sort by</label>
        <select id="sort" name="sort" defaultValue={sortKey} className="rounded-lg border border-[color-mix(in_srgb,var(--sf-fg)_25%,transparent)] bg-transparent px-2 py-1">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k} className="text-black">{v.label}</option>)}
        </select>
        <button type="submit" className="rounded-lg border border-[color-mix(in_srgb,var(--sf-fg)_25%,transparent)] px-3 py-1">Apply</button>
      </form>

      {page.items.length === 0 ? (
        <EmptyShelf title="No products in this category yet" body="Check back soon, or browse another category." />
      ) : (
        <ProductGrid store={store} items={page.items} />
      )}

      <div className="mt-8 flex justify-center gap-3">
        {cursor && <Link href={`${base}?sort=${sortKey}`} className="rounded-full border px-5 py-2 text-sm">Back to start</Link>}
        {page.nextCursor && (
          <Link href={`${base}?sort=${sortKey}&after=${page.nextCursor}`} className="rounded-full bg-[var(--sf-primary)] px-5 py-2 text-sm text-[var(--sf-primary-fg)]">Show more</Link>
        )}
      </div>
    </div>
  );
}
