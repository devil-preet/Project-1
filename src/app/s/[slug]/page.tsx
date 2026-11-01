import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryTile, EmptyShelf, PriceTag, ProductGrid, SectionHead } from "@/components/storefront/parts";
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
  const lead = featured.items[0] ?? latest.items[0];
  const words = store.name.split(/\s+/).filter(Boolean);
  const marquee = (categories.length ? categories.map((c) => c.name) : [store.name]).join(" / ") + " / ";

  return (
    <div className="space-y-20">
      {!after && (
        <>
          <section className="grid items-center gap-10 pt-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:pt-12">
            <div className="flex flex-col gap-6">
              <p className="inline-flex w-fit items-center rounded-full border border-[color:var(--sf-line-strong)] bg-[var(--sf-surface)] px-3.5 py-1.5 font-mono text-[11.5px] tracking-[.06em] backdrop-blur-md">
                <i className="nv-pulse" style={{ background: "var(--sf-accent)" }} aria-hidden />
                {store.currency} · {categories.length} collection{categories.length === 1 ? "" : "s"}
              </p>
              <h1 className="font-heading text-[clamp(40px,6.4vw,88px)] font-semibold leading-[.98] tracking-[-.055em]">
                {words.map((w, i) => (
                  <span key={i} className={i === words.length - 1 && words.length > 1 ? "bg-[linear-gradient(100deg,var(--sf-accent),var(--sf-fg)_75%)] bg-clip-text text-transparent" : undefined}>
                    {w}{" "}
                  </span>
                ))}
              </h1>
              {store.description && <p className="max-w-[46ch] text-lg text-[var(--sf-muted)]">{store.description}</p>}
              <div className="flex flex-wrap items-center gap-5">
                <a
                  href="#latest"
                  className="inline-flex min-h-[54px] items-center gap-3 rounded-full bg-[var(--sf-accent)] px-8 font-bold text-[var(--sf-accent-fg)] shadow-[0_14px_44px_-12px_var(--sf-accent)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_0_5px_color-mix(in_srgb,var(--sf-accent)_28%,transparent),0_18px_54px_-10px_var(--sf-accent)]"
                >
                  Shop now <span aria-hidden>→</span>
                </a>
                {categories[0] && (
                  <Link href={`/s/${store.slug}/category/${categories[0].slug}`} className="border-b border-[color:var(--sf-line-strong)] pb-1 font-bold transition-colors hover:border-[color:var(--sf-accent)]">
                    Browse {categories[0].name}
                  </Link>
                )}
              </div>
            </div>
            {lead && (
              <Link href={`/s/${store.slug}/product/${lead.slug}`} aria-label={`Featured: ${lead.name}`} className="group relative mx-auto block aspect-[4/5] w-full max-w-[460px]">
                <span aria-hidden className="absolute -inset-3.5 animate-[spin_9s_linear_infinite] rounded-[46px] opacity-50 blur-[18px]" style={{ background: "conic-gradient(from 0deg, var(--sf-accent), transparent 30%, transparent 70%, var(--sf-hero), var(--sf-accent))" }} />
                <span className="absolute inset-0 overflow-hidden rounded-[36px] border border-[color:var(--sf-line-strong)] bg-[var(--sf-surface)] shadow-[0_40px_90px_-20px_rgba(0,0,0,.8)]">
                  {lead.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lead.images[0].url} alt={lead.name} className="size-full object-cover transition-transform duration-[1200ms] ease-[var(--nv-ease)] group-hover:scale-[1.06]" />
                  )}
                </span>
                <span className="absolute -left-2 top-[14%] max-w-[70%] truncate rounded-full border border-[color:var(--sf-line-strong)] bg-[var(--sf-glass)] px-3.5 py-1.5 font-mono text-[11.5px] backdrop-blur-md sm:-left-5">{lead.name}</span>
                <span className="absolute -right-2 bottom-[12%] rounded-full bg-[var(--sf-accent)] px-3.5 py-1.5 text-[var(--sf-accent-fg)] sm:-right-4"><PriceTag p={lead} /></span>
              </Link>
            )}
          </section>

          <div aria-hidden className="-mx-5 overflow-hidden border-y border-[color:var(--sf-line)] bg-[var(--sf-surface)] py-4 sm:-mx-8">
            <div className="flex w-max animate-[nv-marq_40s_linear_infinite] whitespace-nowrap font-heading text-[clamp(22px,3vw,38px)] font-semibold uppercase tracking-[-.03em] text-transparent [-webkit-text-stroke:1px_color-mix(in_srgb,var(--sf-fg)_45%,transparent)]">
              {Array(6).fill(marquee).map((m, i) => <span key={i} className="mr-[.5em]">{m}</span>)}
            </div>
          </div>
        </>
      )}

      {!after && categories.length > 0 && (
        <section aria-labelledby="cats">
          <SectionHead id="cats" title="Shop by category" kicker="Collections" />
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {categories.map((c, i) => <CategoryTile key={c.id} store={store} c={c} index={i} />)}
          </ul>
        </section>
      )}

      {featured.items.length > 0 && (
        <section aria-labelledby="featured">
          <SectionHead id="featured" title="Featured" kicker="Hand-picked" />
          <ProductGrid store={store} items={featured.items} />
        </section>
      )}

      <section aria-labelledby="latest-title" id="latest" className="scroll-mt-28">
        <SectionHead id="latest-title" title="Latest products" kicker="New arrivals" />
        {latest.items.length === 0 ? (
          <EmptyShelf title="Nothing here yet" body="This store hasn't published any products. Check back soon." />
        ) : (
          <ProductGrid store={store} items={latest.items} />
        )}
        <div className="mt-10 flex justify-center gap-3">
          {after && <Link href={`/s/${store.slug}`} className="rounded-full border border-[color:var(--sf-line-strong)] px-6 py-3 text-sm font-semibold transition-colors hover:bg-[var(--sf-surface)]">Back to start</Link>}
          {latest.nextCursor && (
            <Link href={`/s/${store.slug}?after=${latest.nextCursor}#latest`} className="rounded-full bg-[var(--sf-accent)] px-7 py-3 text-sm font-bold text-[var(--sf-accent-fg)] shadow-[0_10px_34px_-12px_var(--sf-accent)]">Show more</Link>
          )}
        </div>
      </section>
    </div>
  );
}
