import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/storefront/gallery";
import { PriceTag, ProductGrid } from "@/components/storefront/parts";
import { getPublicProductBySlug, getPublicStore, listPublicProducts } from "@/services/public-store.service";

type Props = { params: Promise<{ slug: string; productSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const store = await getPublicStore(slug);
  const p = store ? await getPublicProductBySlug(store, productSlug) : null;
  return store && p ? { title: `${p.name} · ${store.name}`, description: p.shortDescription || p.description.slice(0, 160) } : { title: "Not found" };
}

export default async function ProductPage({ params }: Props) {
  const { slug, productSlug } = await params;
  const store = await getPublicStore(slug);
  if (!store) notFound();
  // Draft, archived, unknown, or inside an inactive category => the same 404.
  const p = await getPublicProductBySlug(store, productSlug);
  if (!p) notFound();
  const related = await listPublicProducts(store, { categoryId: p.categoryId, limit: 4, excludeId: p.id });

  return (
    <article>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm opacity-70">
        <Link href={`/s/${store.slug}`} className="hover:underline">Home</Link> <span aria-hidden>/</span>{" "}
        <Link href={`/s/${store.slug}/category/${p.categorySlug}`} className="hover:underline">{p.categoryName}</Link> <span aria-hidden>/</span> <span>{p.name}</span>
      </nav>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <Gallery images={p.images} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
          <div className="mt-3"><PriceTag p={p} large /></div>
          <p className={p.inStock ? "mt-3 text-sm font-medium text-emerald-500" : "mt-3 text-sm font-medium text-amber-500"}>
            {p.inStock ? "In stock" : "Out of stock"}
          </p>
          {p.shortDescription && <p className="mt-5 text-lg opacity-85">{p.shortDescription}</p>}
          <div className="mt-6 whitespace-pre-line leading-relaxed opacity-90">{p.description}</div>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="opacity-60">Category</dt>
            <dd><Link href={`/s/${store.slug}/category/${p.categorySlug}`} className="underline-offset-2 hover:underline">{p.categoryName}</Link></dd>
            {p.sku && (<><dt className="opacity-60">SKU</dt><dd>{p.sku}</dd></>)}
          </dl>
        </div>
      </div>
      {related.items.length > 0 && (
        <section aria-labelledby="related" className="mt-16">
          <h2 id="related" className="mb-5 text-xl font-semibold">You may also like</h2>
          <ProductGrid store={store} items={related.items} />
        </section>
      )}
    </article>
  );
}
