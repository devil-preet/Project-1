import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatMoney } from "@/lib/utils/money";
import type { PublicCategory, PublicProduct, PublicStore } from "@/services/public-store.service";

/* Plain <img>: these are same-origin API routes that stream verified public bytes. */

const LINE = "border-[color:var(--sf-line)]";

export function StoreHeader({ store, categories }: { store: PublicStore; categories: PublicCategory[] }) {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-8 sm:pt-4">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-2 rounded-[28px] border border-[color:var(--sf-line-strong)] bg-[var(--sf-glass)] px-4 py-2 shadow-[0_18px_50px_rgba(0,0,0,.35)] backdrop-blur-xl sm:flex-nowrap sm:rounded-full sm:pl-5">
        <Link href={`/s/${store.slug}`} className="flex min-w-0 items-center gap-3">
          {store.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo.url} alt={store.logo.alt} className="size-9 rounded-xl object-contain" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--sf-accent)] font-heading text-sm font-semibold text-[var(--sf-accent-fg)]" aria-hidden>
              {store.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate font-heading text-base font-bold tracking-tight">{store.name}</span>
        </Link>
        <nav aria-label="Categories" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto pb-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:justify-center sm:overflow-visible sm:pb-0">
          {categories.slice(0, 6).map((c) => (
            <Link
              key={c.id}
              href={`/s/${store.slug}/category/${c.slug}`}
              className="shrink-0 rounded-full px-3.5 py-2 text-[13.5px] font-semibold text-[var(--sf-muted)] transition-colors hover:bg-[var(--sf-surface)] hover:text-[var(--sf-fg)]"
            >
              {c.name}
            </Link>
          ))}
        </nav>
        <span className="ml-auto hidden rounded-full border border-[color:var(--sf-line-strong)] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[.1em] text-[var(--sf-muted)] sm:inline-block">{store.currency}</span>
      </div>
    </header>
  );
}

export function StoreFooter({ store }: { store: PublicStore }) {
  const links = Object.entries(store.social).filter(([, v]) => /^https?:\/\//.test(v));
  return (
    <footer className={`mt-24 border-t ${LINE} bg-[var(--sf-surface)]`}>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-start justify-between gap-8 px-5 py-12 sm:px-8">
        <div className="max-w-sm">
          <p className="font-heading text-[22px] font-semibold tracking-tight">{store.name}</p>
          {store.description && <p className="mt-2 text-sm text-[var(--sf-muted)]">{store.description}</p>}
        </div>
        <div className="space-y-1.5 text-sm text-[var(--sf-muted)]">
          {store.contactEmail && <p>{store.contactEmail}</p>}
          {store.contactPhone && <p>{store.contactPhone}</p>}
          {links.length > 0 && (
            <p className="flex gap-4 pt-1">
              {links.map(([k, v]) => <a key={k} href={v} rel="noopener noreferrer nofollow" target="_blank" className="font-semibold capitalize text-[var(--sf-fg)] underline-offset-4 hover:underline">{k}</a>)}
            </p>
          )}
        </div>
      </div>
      <p className="px-5 pb-8 text-center font-mono text-[11px] tracking-[.06em] text-[var(--sf-muted)] opacity-70">© {new Date().getFullYear()} {store.name}</p>
    </footer>
  );
}

export function PriceTag({ p, large }: { p: Pick<PublicProduct, "priceCents" | "compareAtPriceCents" | "currency">; large?: boolean }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2.5 font-mono">
      <span className={large ? "text-[26px] font-semibold" : "text-[15px] font-semibold"}>{formatMoney(p.priceCents, p.currency)}</span>
      {p.compareAtPriceCents && p.compareAtPriceCents > p.priceCents && (
        <s className="text-sm font-normal opacity-55" aria-label={`Was ${formatMoney(p.compareAtPriceCents, p.currency)}`}>{formatMoney(p.compareAtPriceCents, p.currency)}</s>
      )}
    </span>
  );
}

export function SectionHead({ id, title, kicker }: { id?: string; title: string; kicker?: string }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        {kicker && <p className="mb-2 font-mono text-[11px] uppercase tracking-[.14em] text-[var(--sf-muted)]">{kicker}</p>}
        <h2 id={id} className="font-heading text-[clamp(26px,3.4vw,42px)] font-semibold leading-none tracking-[-.045em]">{title}</h2>
      </div>
    </div>
  );
}

export function ProductTile({ store, p, index = 0 }: { store: PublicStore; p: PublicProduct; index?: number }) {
  return (
    <li style={{ ["--i" as string]: Math.min(index, 12) }} className="nv-rise">
      <Link
        href={`/s/${store.slug}/product/${p.slug}`}
        className={`group block rounded-[28px] border ${LINE} bg-[linear-gradient(180deg,var(--sf-surface),transparent)] p-2 transition-[transform,border-color] duration-500 ease-[var(--nv-ease)] hover:-translate-y-1 hover:border-[color:var(--sf-line-strong)]`}
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-[var(--sf-surface)]">
          {p.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.images[0].url} alt={p.images[0].alt} loading="lazy" className="size-full object-cover transition-transform duration-[800ms] ease-[var(--nv-ease)] group-hover:scale-[1.06]" />
          ) : (
            <div className="flex size-full items-center justify-center opacity-40"><ImageOff className="size-8" aria-hidden /></div>
          )}
          {!p.inStock && <span className="absolute left-3.5 top-3.5 rounded-full bg-white px-3 py-1.5 font-mono text-[10.5px] font-semibold text-[#100E13]">Out of stock</span>}
          {p.compareAtPriceCents && p.compareAtPriceCents > p.priceCents && p.inStock && <span className="absolute left-3.5 top-3.5 rounded-full bg-[var(--sf-accent)] px-3 py-1.5 font-mono text-[10.5px] font-semibold text-[var(--sf-accent-fg)]">Sale</span>}
        </div>
        <div className="px-3 pb-3 pt-3.5">
          <p className="font-mono text-[10.5px] uppercase tracking-[.1em] text-[var(--sf-muted)]">{p.categoryName}</p>
          <h3 className="mt-1 line-clamp-2 text-[15.5px] font-bold leading-snug">{p.name}</h3>
          <div className="mt-1.5"><PriceTag p={p} /></div>
        </div>
      </Link>
    </li>
  );
}

export function ProductGrid({ store, items }: { store: PublicStore; items: PublicProduct[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-5 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p, i) => <ProductTile key={p.id} store={store} p={p} index={i} />)}
    </ul>
  );
}

export function CategoryTile({ store, c, index = 0 }: { store: PublicStore; c: PublicCategory; index?: number }) {
  return (
    <li style={{ ["--i" as string]: Math.min(index, 12) }} className="nv-rise">
      <Link
        href={`/s/${store.slug}/category/${c.slug}`}
        className={`group relative block aspect-[3/4] overflow-hidden rounded-[28px] border ${LINE} bg-[var(--sf-hero)] transition-transform duration-500 ease-[var(--nv-ease)] hover:-translate-y-1`}
      >
        {c.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-[800ms] ease-[var(--nv-ease)] group-hover:scale-105" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" aria-hidden />
        <span className="absolute inset-x-5 bottom-5 font-heading text-[19px] font-semibold tracking-tight text-white">{c.name}</span>
      </Link>
    </li>
  );
}

export function EmptyShelf({ title, body }: { title: string; body: string }) {
  return (
    <div className={`rounded-[28px] border border-dashed ${LINE} px-6 py-16 text-center`}>
      <p className="font-heading text-2xl font-semibold tracking-tight">{title}</p>
      <p className="mt-2 text-sm text-[var(--sf-muted)]">{body}</p>
    </div>
  );
}
