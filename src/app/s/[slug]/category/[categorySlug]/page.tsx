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
      <nav aria-label="Breadcrumb" className="mb-5 font-mono text-xs text-[var(--sf-muted)]">
        <Link href={`/s/${store.slug}`} className="hover:text-[var(--sf-fg)]">Home</Link> <span aria-hidden>/</span> <span className="text-[var(--sf-fg)]">{category.name}</span>
      </nav>
      <header className="relative mb-8 overflow-hidden rounded-[32px] border border-[color:var(--sf-line-strong)] bg-[var(--sf-hero)] text-[var(--sf-hero-fg)]">
        {category.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={category.image.url} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/55 to-transparent" />
        <div className="relative px-6 py-12 sm:px-12 sm:py-16">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[.14em] opacity-80">Collection</p>
          <h1 className="font-heading text-[clamp(34px,5.4vw,72px)] font-semibold leading-none tracking-[-.05em]">{category.name}</h1>
          {category.description && <p className="mt-4 max-w-2xl text-lg opacity-90">{category.description}</p>}
        </div>
      </header>

      <form action={base} className="mb-8 flex items-center justify-end gap-2 rounded-full border border-[color:var(--sf-line)] bg-[var(--sf-surface)] py-2 pl-5 pr-2 text-sm">
        <label htmlFor="sort" className="mr-auto text-[var(--sf-muted)]">Sort by</label>
        <select id="sort" name="sort" defaultValue={sortKey} className="rounded-full border border-[color:var(--sf-line-strong)] bg-transparent px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-accent)]">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k} className="text-black">{v.label}</option>)}
        </select>
        <button type="submit" className="rounded-full bg-[var(--sf-fg)] px-4 py-1.5 font-semibold text-[var(--sf-bg)]">Apply</button>
      </form>

      {page.items.length === 0 ? (
        <EmptyShelf title="No products in this category yet" body="Check back soon, or browse another category." />
      ) : (
        <ProductGrid store={store} items={page.items} />
      )}

      <div className="mt-10 flex justify-center gap-3">
        {cursor && <Link href={`${base}?sort=${sortKey}`} className="rounded-full border border-[color:var(--sf-line-strong)] px-6 py-3 text-sm font-semibold">Back to start</Link>}
        {page.nextCursor && (
          <Link href={`${base}?sort=${sortKey}&after=${page.nextCursor}`} className="rounded-full bg-[var(--sf-accent)] px-7 py-3 text-sm font-bold text-[var(--sf-accent-fg)]">Show more</Link>
        )}
      </div>
    </div>
  );
}
