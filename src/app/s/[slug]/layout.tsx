import { notFound } from "next/navigation";
import { StoreFooter, StoreHeader } from "@/components/storefront/parts";
import { storefrontVars } from "@/lib/catalog/theme";
import { getPublicCategories, getPublicStore } from "@/services/public-store.service";

/** Public, unauthenticated. Unknown / unpublished / deleted stores are all the same 404. */
export default async function StorefrontLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getPublicStore(slug);
  if (!store) notFound();
  const categories = await getPublicCategories(store.businessId);
  return (
    <div
      style={storefrontVars(store.theme)}
      className="relative isolate min-h-svh overflow-x-clip bg-[var(--sf-bg)] text-[var(--sf-fg)]"
    >
      {/* Nova aurora, tinted by the brand accent. Covers the app-level background for this subtree. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 70% -15%, var(--sf-glow) 0%, transparent 40%)" }} />
        <i className="absolute -left-[12vw] -top-[18vw] size-[46vw] rounded-full opacity-40 blur-[110px]" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--sf-accent) 55%, transparent), transparent 65%)" }} />
      </div>
      <StoreHeader store={store} categories={categories} />
      <main className="mx-auto max-w-[1240px] px-5 pb-4 pt-6 sm:px-8">{children}</main>
      <StoreFooter store={store} />
    </div>
  );
}
