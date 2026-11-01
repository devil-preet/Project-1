import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/storefront/gallery";
import { PriceTag, ProductGrid, SectionHead } from "@/components/storefront/parts";
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
      <nav aria-label="Breadcrumb" className="mb-6 font-mono text-xs text-[var(--sf-muted)]">
        <Link href={`/s/${store.slug}`} className="hover:text-[var(--sf-fg)]">Home</Link> <span aria-hidden>/</span>{" "}
        <Link href={`/s/${store.slug}/category/${p.categorySlug}`} className="hover:text-[var(--sf-fg)]">{p.categoryName}</Link> <span aria-hidden>/</span> <span className="text-[var(--sf-fg)]">{p.name}</span>
      </nav>
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <Gallery images={p.images} />
        <div className="md:pt-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[.14em] text-[var(--sf-muted)]">{p.categoryName}</p>
          <h1 className="font-heading text-[clamp(30px,3.8vw,52px)] font-semibold leading-none tracking-[-.05em]">{p.name}</h1>
          <div className="mt-5"><PriceTag p={p} large /></div>
          <p className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-xs font-semibold ${p.inStock ? "border-[#86D6A0]/40 text-[#86D6A0]" : "border-[#E9CDA9]/40 text-[#E9CDA9]"}`}>
            <i className="size-1.5 rounded-full bg-current" aria-hidden />{p.inStock ? "In stock" : "Out of stock"}
          </p>
          {p.shortDescription && <p className="mt-6 text-lg text-[var(--sf-fg)]/85">{p.shortDescription}</p>}
          <div className="mt-5 whitespace-pre-line leading-relaxed text-[var(--sf-muted)]">{p.description}</div>
          <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 border-t border-[color:var(--sf-line)] pt-6 text-sm">
            <dt className="font-mono text-[11px] uppercase tracking-[.12em] text-[var(--sf-muted)]">Category</dt>
            <dd><Link href={`/s/${store.slug}/category/${p.categorySlug}`} className="font-semibold underline-offset-4 hover:underline">{p.categoryName}</Link></dd>
            {p.sku && (<><dt className="font-mono text-[11px] uppercase tracking-[.12em] text-[var(--sf-muted)]">SKU</dt><dd className="font-mono">{p.sku}</dd></>)}
          </dl>
        </div>
      </div>
      {related.items.length > 0 && (
        <section aria-labelledby="related" className="mt-24">
          <SectionHead id="related" title="You may also like" kicker="More from this collection" />
          <ProductGrid store={store} items={related.items} />
        </section>
      )}
    </article>
  );
}
