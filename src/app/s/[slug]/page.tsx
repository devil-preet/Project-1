import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryTile, EmptyShelf, ProductGrid } from "@/components/storefront/parts";
import { idSchema } from "@/lib/validations/catalog";
import { getPublicCategories, getPublicStore, listPublicProducts } from "@/services/public-store.service";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await getPublicStore((await params).slug);
  return store ? { title: store.name, description: store.description || `Shop ${store.name}` } : { title: "Not found" };
}

export default async function StorefrontHome({ params, searchParams }: Props) {
  const { slug } = await params;
  const store = await getPublicStore(slug);
  if (!store) notFound();
  const sp = await searchParams;
  const after = typeof sp.after === "string" && idSchema.safeParse(sp.after).success ? sp.after : undefined;

  const [categories, featured, latest] = await Promise.all([
    getPublicCategories(store.businessId),
    after ? Promise.resolve({ items: [], nextCursor: null }) : listPublicProducts(store, { featured: true, limit: 8 }),
    listPublicProducts(store, { cursor: after, limit: 12 }),
  ]);

  return (
    <div className="space-y-14">
      {!after && (
        <section className="rounded-3xl bg-[var(--sf-primary)] px-6 py-14 text-center text-[var(--sf-primary-fg)] sm:px-12 sm:py-20">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{store.name}</h1>
          {store.description && <p className="mx-auto mt-4 max-w-xl text-base opacity-85 sm:text-lg">{store.description}</p>}
        </section>
      )}

      {!after && categories.length > 0 && (
        <section aria-labelledby="cats">
          <h2 id="cats" className="mb-5 text-xl font-semibold">Shop by category</h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {categories.map((c) => <CategoryTile key={c.id} store={store} c={c} />)}
          </ul>
        </section>
      )}

      {featured.items.length > 0 && (
        <section aria-labelledby="featured">
          <h2 id="featured" className="mb-5 text-xl font-semibold">Featured</h2>
          <ProductGrid store={store} items={featured.items} />
        </section>
      )}

      <section aria-labelledby="latest-title" id="latest">
        <h2 id="latest-title" className="mb-5 text-xl font-semibold">Latest products</h2>
        {latest.items.length === 0 ? (
          <EmptyShelf title="Nothing here yet" body="This store hasn't published any products. Check back soon." />
        ) : (
          <ProductGrid store={store} items={latest.items} />
        )}
        <div className="mt-8 flex justify-center gap-3">
          {after && <Link href={`/s/${store.slug}`} className="rounded-full border px-5 py-2 text-sm">Back to start</Link>}
          {latest.nextCursor && (
            <Link href={`/s/${store.slug}?after=${latest.nextCursor}#latest`} className="rounded-full bg-[var(--sf-primary)] px-5 py-2 text-sm text-[var(--sf-primary-fg)]">Show more</Link>
          )}
        </div>
      </section>
    </div>
  );
}
