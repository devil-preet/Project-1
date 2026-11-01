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
      className="min-h-svh bg-[var(--sf-bg)] text-[var(--sf-fg)]"
    >
      <StoreHeader store={store} categories={categories} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <StoreFooter store={store} />
    </div>
  );
}
