import Link from "next/link";
import type { Metadata } from "next";
import { Package, Plus, Search } from "lucide-react";
import { ProductCard } from "@/components/catalog/product-card";
import { EmptyState, PageHeader } from "@/components/workspace/page-bits";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireWorkspace } from "@/lib/auth/workspace";
import { productListQuery } from "@/lib/validations/catalog";
import { listCategoryOptions } from "@/services/category.service";
import { listProducts } from "@/services/product.service";

export const metadata: Metadata = { title: "Products" };

const SELECT = "h-8 rounded-lg border border-input bg-background px-2 text-sm";

export default async function ProductsPage({
  params, searchParams,
}: { params: Promise<{ businessId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { businessId } = await params;
  const ws = await requireWorkspace(businessId, "business:view");
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const f = productListQuery.parse(flat);
  const [sort, dir] = (f.order ?? "created-desc").split("-") as ["created" | "name" | "price", "asc" | "desc"];

  const [page, categories] = await Promise.all([
    listProducts(businessId, { q: f.q, status: f.status, categoryId: f.categoryId, sort, dir, cursor: f.cursor }),
    listCategoryOptions(businessId),
  ]);
  const can = { write: ws.can("product:write"), publish: ws.can("product:publish"), delete: ws.can("product:delete") };
  const filtered = !!(f.q || f.status || f.categoryId);
  const nextQuery = new URLSearchParams(Object.entries({ q: f.q, status: f.status, categoryId: f.categoryId, order: f.order, cursor: page.nextCursor ?? undefined }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything you sell, as a visual catalogue."
        actions={can.write ? <Link href={`/b/${businessId}/products/new`} className={buttonVariants()}><Plus className="size-3.5" /> Add product</Link> : undefined}
      />

      <form role="search" action={`/b/${businessId}/products`} className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={f.q ?? ""} placeholder="Search by name" aria-label="Search products" className="pl-8" />
        </div>
        <select name="categoryId" defaultValue={f.categoryId ?? ""} aria-label="Filter by category" className={SELECT}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="status" defaultValue={f.status ?? ""} aria-label="Filter by status" className={SELECT}>
          <option value="">All statuses</option>
          <option value="active">Live</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <select name="order" defaultValue={f.order ?? "created-desc"} aria-label="Sort" className={SELECT}>
          <option value="created-desc">Newest first</option>
          <option value="created-asc">Oldest first</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="price-asc">Price low–high</option>
          <option value="price-desc">Price high–low</option>
        </select>
        <Button type="submit" variant="outline">Apply</Button>
        {filtered && <Link href={`/b/${businessId}/products`} className={buttonVariants({ variant: "ghost" })}>Reset</Link>}
      </form>

      {page.items.length === 0 ? (
        filtered ? (
          <EmptyState icon={<Search className="size-5" />} title="No products match" body="Try a different search or clear the filters." action={<Link href={`/b/${businessId}/products`} className={buttonVariants({ variant: "outline" })}>Clear filters</Link>} />
        ) : (
          <EmptyState
            icon={<Package className="size-5" />}
            title="No products yet"
            body={categories.length === 0 ? "Create a category, then add your first product." : "Add your first product to start building your catalogue."}
            action={
              can.write ? (
                <Link href={categories.length === 0 && ws.can("category:write") ? `/b/${businessId}/categories` : `/b/${businessId}/products/new`} className={buttonVariants()}>
                  {categories.length === 0 && ws.can("category:write") ? "Create a category" : "Add a product"}
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {page.items.map((p) => <ProductCard key={p.id} businessId={businessId} product={p} can={can} />)}
        </ul>
      )}

      {page.nextCursor && (
        <div className="mt-6 text-center">
          <Link href={`/b/${businessId}/products?${nextQuery}`} className={buttonVariants({ variant: "outline" })}>Next page</Link>
        </div>
      )}
    </>
  );
}
