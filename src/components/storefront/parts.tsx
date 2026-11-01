import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatMoney } from "@/lib/utils/money";
import type { PublicCategory, PublicProduct, PublicStore } from "@/services/public-store.service";

/* Plain <img>: these are same-origin API routes that stream verified public bytes. */

export function StoreHeader({ store, categories }: { store: PublicStore; categories: PublicCategory[] }) {
  return (
    <header className="sticky top-0 z-10 border-b border-[color-mix(in_srgb,var(--sf-fg)_12%,transparent)] bg-[var(--sf-bg)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={`/s/${store.slug}`} className="flex min-w-0 items-center gap-3 font-semibold">
          {store.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo.url} alt={store.logo.alt} className="size-9 rounded-md object-contain" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-md bg-[var(--sf-primary)] text-sm text-[var(--sf-primary-fg)]" aria-hidden>
              {store.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate">{store.name}</span>
        </Link>
        <nav aria-label="Categories" className="flex max-w-[55%] gap-4 overflow-x-auto text-sm">
          {categories.slice(0, 6).map((c) => (
            <Link key={c.id} href={`/s/${store.slug}/category/${c.slug}`} className="shrink-0 opacity-75 transition-opacity hover:opacity-100">{c.name}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function StoreFooter({ store }: { store: PublicStore }) {
  const links = Object.entries(store.social).filter(([, v]) => /^https?:\/\//.test(v));
  return (
    <footer className="mt-16 border-t border-[color-mix(in_srgb,var(--sf-fg)_12%,transparent)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-4 py-8 text-sm sm:px-6">
        <div>
          <p className="font-semibold">{store.name}</p>
          {store.description && <p className="mt-1 max-w-sm opacity-70">{store.description}</p>}
        </div>
        <div className="space-y-1 opacity-80">
          {store.contactEmail && <p>{store.contactEmail}</p>}
          {store.contactPhone && <p>{store.contactPhone}</p>}
          {links.length > 0 && (
            <p className="flex gap-3">
              {links.map(([k, v]) => <a key={k} href={v} rel="noopener noreferrer nofollow" target="_blank" className="capitalize underline-offset-2 hover:underline">{k}</a>)}
            </p>
          )}
        </div>
      </div>
      <p className="px-4 pb-6 text-center text-xs opacity-50">© {new Date().getFullYear()} {store.name}</p>
    </footer>
  );
}

export function PriceTag({ p, large }: { p: Pick<PublicProduct, "priceCents" | "compareAtPriceCents" | "currency">; large?: boolean }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className={large ? "text-2xl font-semibold" : "font-semibold"}>{formatMoney(p.priceCents, p.currency)}</span>
      {p.compareAtPriceCents && p.compareAtPriceCents > p.priceCents && (
        <s className="text-sm opacity-55" aria-label={`Was ${formatMoney(p.compareAtPriceCents, p.currency)}`}>{formatMoney(p.compareAtPriceCents, p.currency)}</s>
      )}
    </span>
  );
}

export function ProductTile({ store, p }: { store: PublicStore; p: PublicProduct }) {
  return (
    <li>
      <Link href={`/s/${store.slug}/product/${p.slug}`} className="group block">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--sf-fg)_6%,transparent)]">
          {p.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.images[0].url} alt={p.images[0].alt} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <div className="flex size-full items-center justify-center opacity-40"><ImageOff className="size-8" aria-hidden /></div>
          )}
          {!p.inStock && <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">Out of stock</span>}
        </div>
        <h3 className="mt-3 line-clamp-2 text-sm font-medium group-hover:underline">{p.name}</h3>
        <div className="mt-1 text-sm"><PriceTag p={p} /></div>
      </Link>
    </li>
  );
}

export function ProductGrid({ store, items }: { store: PublicStore; items: PublicProduct[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => <ProductTile key={p.id} store={store} p={p} />)}
    </ul>
  );
}

export function CategoryTile({ store, c }: { store: PublicStore; c: PublicCategory }) {
  return (
    <li>
      <Link href={`/s/${store.slug}/category/${c.slug}`} className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-[var(--sf-primary)]">
        {c.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" aria-hidden />
        <span className="absolute inset-x-3 bottom-3 text-lg font-semibold text-white">{c.name}</span>
      </Link>
    </li>
  );
}

export function EmptyShelf({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[color-mix(in_srgb,var(--sf-fg)_20%,transparent)] px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-70">{body}</p>
    </div>
  );
}
