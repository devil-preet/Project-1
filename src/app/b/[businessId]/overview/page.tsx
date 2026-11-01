import Link from "next/link";
import type { Metadata } from "next";
import { Check, ExternalLink, FolderTree, Package, Palette, Plus, Store } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/workspace";
import { adminDb } from "@/lib/firebase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

const RING_C = 2 * Math.PI * 56;

export default async function OverviewPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ws = await requireWorkspace(businessId);
  const db = adminDb();
  const products = db.collection(`businesses/${businessId}/products`);
  const [cats, total, active, draft, archived, stocked, branding] = await Promise.all([
    db.collection(`businesses/${businessId}/categories`).orderBy("sortOrder").limit(12).get(),
    products.count().get(),
    products.where("status", "==", "active").count().get(),
    products.where("status", "==", "draft").count().get(),
    products.where("status", "==", "archived").count().get(),
    products.orderBy("stockQuantity", "desc").limit(6).get(), // single-field auto index; products without stock are skipped
    db.doc(`businesses/${businessId}/settings/branding`).get(),
  ]);
  const n = { products: total.data().count, live: active.data().count, draft: draft.data().count, archived: archived.data().count, categories: cats.size };
  const published = ws.business.storeStatus === "published";
  const livePct = n.products ? Math.round((n.live / n.products) * 100) : 0;

  // status ring segments
  let off = 0;
  const segs = [
    { v: n.live, color: "#D9B8F4", label: "live" },
    { v: n.draft, color: "#E9CDA9", label: "draft" },
    { v: n.archived, color: "#6b6173", label: "archived" },
  ].map((s) => {
    const len = (RING_C * s.v) / Math.max(1, n.products);
    const seg = { ...s, len, off };
    off += len;
    return seg;
  });

  const catRows = cats.docs.map((d) => ({ id: d.id, name: String(d.get("name")), count: Number(d.get("productCount") ?? 0), active: d.get("active") === true }));
  const catMax = Math.max(1, ...catRows.map((c) => c.count));
  const topStock = stocked.docs
    .map((d) => ({ id: d.id, name: String(d.get("name")), stock: Number(d.get("stockQuantity") ?? 0) }))
    .filter((p) => p.stock > 0);
  const stockMax = Math.max(1, ...topStock.map((p) => p.stock));

  const checks = [
    { done: !!branding.get("logo"), label: "Upload a logo", href: `/b/${businessId}/branding`, perm: ws.can("branding:update") },
    { done: n.categories > 0, label: "Create your first category", href: `/b/${businessId}/categories`, perm: ws.can("category:write") },
    { done: n.products > 0, label: "Add a product", href: `/b/${businessId}/products/new`, perm: ws.can("product:write") },
    { done: n.live > 0, label: "Publish a product (needs an image)", href: `/b/${businessId}/products`, perm: ws.can("product:publish") },
    { done: published, label: "Take the store live", href: `/b/${businessId}/settings`, perm: ws.can("settings:update") },
  ];
  const done = checks.filter((c) => c.done).length;

  const hour = new Date().getHours();
  const hi = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (ws.session.name ?? ws.session.email).split(/[\s@]/)[0];

  const tiles = [
    { href: `/b/${businessId}/products/new`, icon: Package, title: "Add a product", sub: "Upload photos, set price, publish", show: ws.can("product:write") },
    { href: `/b/${businessId}/categories`, icon: FolderTree, title: "Categories", sub: "Organise how customers browse", show: true },
    { href: `/b/${businessId}/branding`, icon: Palette, title: "Brand it", sub: "Logo and colours", show: ws.can("branding:update") },
    { href: `/b/${businessId}/settings`, icon: Store, title: published ? "Store settings" : "Go live", sub: published ? "Name, currency, visibility" : "Publish your storefront", show: ws.can("settings:update") },
  ].filter((t) => t.show);

  const stats = [
    { label: "Live", value: n.live },
    { label: "Drafts", value: n.draft },
    { label: "Archived", value: n.archived },
    { label: "Categories", value: n.categories },
    { label: "Total products", value: n.products },
  ];

  return (
    <>
      <header className="nv-rise mb-8 flex flex-wrap items-center justify-between gap-8">
        <div className="min-w-0">
          <p className="nv-kicker mb-3"><i className="nv-pulse" aria-hidden />{ws.business.name} · command center</p>
          <h1 className="nv-title nv-gradient-text text-[clamp(32px,5vw,64px)] tracking-[-.045em]">{hi}, {first}.</h1>
          <p className="mt-3 max-w-xl text-[15.5px] text-muted-foreground">
            {n.live} product{n.live === 1 ? "" : "s"} live{n.draft ? `, ${n.draft} draft${n.draft === 1 ? "" : "s"} waiting` : ""}. {published ? "Your store is live." : "Your store is private until you publish it."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {ws.can("product:write") && (
              <Link href={`/b/${businessId}/products/new`} className={buttonVariants({ size: "lg" })}><Plus /> Add product</Link>
            )}
            {published && (
              <Link href={`/s/${ws.business.slug}`} target="_blank" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Preview store <ExternalLink />
              </Link>
            )}
          </div>
        </div>
        <figure className="relative m-0 size-[170px] shrink-0 sm:size-[200px]">
          <svg viewBox="0 0 140 140" className="size-full drop-shadow-[0_0_16px_rgba(217,184,244,.35)]" role="img" aria-label={`${n.live} live, ${n.draft} drafts, ${n.archived} archived`}>
            <circle cx="70" cy="70" r="56" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="9" />
            {n.products > 0 && segs.filter((s) => s.v > 0).map((s) => (
              <circle
                key={s.label} cx="70" cy="70" r="56" fill="none" stroke={s.color} strokeWidth="9" strokeLinecap="round"
                strokeDasharray={`${s.len.toFixed(1)} ${(RING_C - s.len).toFixed(1)}`} strokeDashoffset={(-s.off).toFixed(1)}
                transform="rotate(-90 70 70)" style={{ animation: "nv-ringin 1.4s var(--nv-ease) both" }}
              />
            ))}
          </svg>
          <figcaption className="absolute inset-0 flex items-center justify-center gap-0.5 font-heading">
            <b className="text-[34px] font-semibold tracking-tight sm:text-[42px]">{livePct}</b>
            <span className="nv-mono text-xs text-muted-foreground">% live</span>
          </figcaption>
        </figure>
      </header>

      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s, i) => (
          <div key={s.label} style={{ ["--i" as string]: i }} className="nv-panel nv-panel-hover nv-rise p-5">
            <dd className="nv-title text-[clamp(26px,2.6vw,36px)] tabular-nums">{s.value}</dd>
            <dt className="nv-label mt-1.5">{s.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mb-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Link
            key={t.title} href={t.href} style={{ ["--i" as string]: i }}
            className="nv-rise nv-panel nv-panel-lift nv-panel-hover flex flex-col gap-1.5 bg-[linear-gradient(160deg,rgba(217,184,244,.1),rgba(248,243,247,.02)_55%)] p-5"
          >
            <t.icon className="mb-2 size-[22px] text-primary" aria-hidden />
            <b className="font-heading text-base font-semibold tracking-tight">{t.title}</b>
            <span className="text-[13.5px] text-muted-foreground">{t.sub}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="nv-panel nv-rise p-6">
          <h2 className="nv-label mb-5">Catalogue by category</h2>
          {catRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <div className="flex h-[210px] items-end gap-3.5 pt-1.5">
              {catRows.map((c) => (
                <div key={c.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <b className="nv-mono text-[13px]">{c.count}</b>
                  <i
                    className="block w-full max-w-14 origin-bottom rounded-t-xl rounded-b-sm"
                    style={{
                      height: `${Math.max(6, Math.round((c.count / catMax) * 100))}%`,
                      background: c.active ? "linear-gradient(180deg,#D9B8F4,rgba(217,184,244,.15))" : "linear-gradient(180deg,#6d6275,rgba(109,98,117,.15))",
                      boxShadow: c.active ? "0 0 24px rgba(217,184,244,.2)" : "none",
                      animation: "nv-grow .9s var(--nv-ease) both",
                    }}
                  />
                  <span className="w-full truncate text-center text-[11.5px] text-muted-foreground" title={c.name}>{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="nv-panel nv-rise p-6">
          <h2 className="nv-label mb-5">Most stocked</h2>
          {topStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">Set a stock quantity on a product (More options) to see it here.</p>
          ) : (
            <ul>
              {topStock.map((p) => (
                <li key={p.id} className="grid grid-cols-[minmax(0,1.2fr)_1.6fr_36px] items-center gap-3 py-2 text-[13.5px]">
                  <span className="truncate">{p.name}</span>
                  <em className="block h-2 overflow-hidden rounded-full bg-white/[.07]">
                    <i className="block h-full origin-left rounded-full bg-[linear-gradient(90deg,#C69CE9,#EAD7FA)]" style={{ width: `${Math.max(3, Math.round((p.stock / stockMax) * 100))}%`, animation: "nv-growx 1s var(--nv-ease) both" }} />
                  </em>
                  <b className="nv-mono text-right text-[12.5px]">{p.stock}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="nv-panel nv-rise p-6 lg:col-span-2">
          <h2 className="nv-label mb-4 flex items-center justify-between">Launch readiness <small className="nv-mono">{done}/{checks.length}</small></h2>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/[.08]">
            <i className="block h-full origin-left rounded-full bg-[linear-gradient(90deg,#C69CE9,#EAD7FA)]" style={{ width: `${Math.round((done / checks.length) * 100)}%`, animation: "nv-growx 1.1s var(--nv-ease) both" }} />
          </div>
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-3 border-b border-[var(--nv-line)] py-3 text-sm last:border-0">
                <span className="flex items-center gap-3">
                  <span className={cn("flex size-[18px] items-center justify-center rounded-full border", c.done ? "border-primary bg-primary text-primary-foreground" : "border-[var(--nv-line-strong)]")}>
                    {c.done && <Check className="size-3" aria-label="Done" />}
                  </span>
                  <span className={cn(c.done && "text-muted-foreground line-through")}>{c.label}</span>
                </span>
                {!c.done && c.perm && <Link href={c.href} className="text-[13px] font-semibold text-primary underline-offset-4 hover:underline">Go</Link>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
