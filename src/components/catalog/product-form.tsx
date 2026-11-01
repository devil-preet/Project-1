"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/api/client";
import type { ProductDTO } from "@/lib/catalog/types";
import { centsToInput, parseMoney } from "@/lib/utils/money";
import type { ProductStatus } from "@/types";
import { CategoryDialog } from "./category-dialog";
import { ImageUploader, type ImageItem } from "./image-uploader";

interface CategoryOption {
  id: string;
  name: string;
  active: boolean;
}

const SELECT = "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm";

function Err({ msgs }: { msgs?: string[] }) {
  return <p className="min-h-4 text-xs text-destructive" role={msgs?.length ? "alert" : undefined}>{msgs?.[0]}</p>;
}

export function ProductForm({
  businessId, currency, categories: initialCategories, product, can,
}: {
  businessId: string;
  currency: string;
  categories: CategoryOption[];
  product?: ProductDTO;
  can: { publish: boolean; categoryWrite: boolean; upload: boolean };
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [catDialog, setCatDialog] = useState(false);

  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [price, setPrice] = useState(product ? centsToInput(product.priceCents) : "");
  const [shortDescription, setShort] = useState(product?.shortDescription ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [images, setImages] = useState<ImageItem[]>(product?.images.map((i) => ({ mediaId: i.mediaId, url: i.url })) ?? []);
  const [sku, setSku] = useState(product?.sku ?? "");
  const [stock, setStock] = useState(product?.stockQuantity != null ? String(product.stockQuantity) : "");
  const [availability, setAvailability] = useState(product?.availability ?? "in_stock");
  const [compareAt, setCompareAt] = useState(product?.compareAtPriceCents != null ? centsToInput(product.compareAtPriceCents) : "");
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [seoTitle, setSeoTitle] = useState(product?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(product?.seoDescription ?? "");

  const [busy, setBusy] = useState<ProductStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function submit(status: ProductStatus) {
    setError(null);
    const local: Record<string, string[]> = {};
    const priceCents = parseMoney(price);
    const compareAtPriceCents = compareAt.trim() ? parseMoney(compareAt) : null;
    if (name.trim().length < 2) local.name = ["Enter a product name"];
    if (!categoryId) local.categoryId = ["Choose a category"];
    if (!description.trim()) local.description = ["Enter a description"];
    if (priceCents === null) local.priceCents = ["Enter a valid price, e.g. 499 or 499.50"];
    if (compareAt.trim() && compareAtPriceCents === null) local.compareAtPriceCents = ["Enter a valid price"];
    if (status === "active" && images.length === 0) local.imageIds = ["Add at least one image before publishing"];
    const stockNum = stock.trim() === "" ? null : Number(stock);
    if (stockNum !== null && (!Number.isInteger(stockNum) || stockNum < 0)) local.stockQuantity = ["Use a whole number, 0 or more"];
    setFields(local);
    if (Object.keys(local).length) return;

    setBusy(status);
    const body = {
      name, slug, categoryId, shortDescription, description,
      priceCents, compareAtPriceCents, sku, stockQuantity: stockNum, availability, featured,
      sortOrder: product?.sortOrder ?? 0, seoTitle, seoDescription,
      imageIds: images.map((i) => i.mediaId), status,
    };
    const res = await postJson(`/api/b/${businessId}/products`, product ? { action: "update", id: product.id, product: body } : { action: "create", product: body });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      setFields(res.fieldErrors ?? {});
      return;
    }
    router.push(`/b/${businessId}/products`);
    router.refresh();
  }

  const current = product?.status ?? "draft";
  const isBusy = busy !== null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(current); }} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-background p-5">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Product name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-invalid={!!fields.name} autoFocus={!product} />
            <Err msgs={fields.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-cat">Category</Label>
            <div className="flex gap-2">
              <select id="p-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={SELECT} aria-invalid={!!fields.categoryId}>
                <option value="">Select a category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (hidden)"}</option>)}
              </select>
              {can.categoryWrite && (
                <Button type="button" variant="outline" onClick={() => setCatDialog(true)}><Plus className="size-3.5" /> New</Button>
              )}
            </div>
            <Err msgs={fields.categoryId} />
            {categories.length === 0 && !can.categoryWrite && (
              <p className="text-xs text-muted-foreground">No categories exist yet. Ask a manager or admin to create one.</p>
            )}
          </div>
          {can.upload ? (
            <div>
              <ImageUploader businessId={businessId} value={images} onChange={setImages} help="The first image is the cover. Use “Cover” to change it." />
              <Err msgs={fields.imageIds} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Your role can&apos;t upload images.</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="p-price">Price ({currency})</Label>
            <Input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" aria-invalid={!!fields.priceCents} className="max-w-48" />
            <Err msgs={fields.priceCents} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-short">Short description <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="p-short" value={shortDescription} onChange={(e) => setShort(e.target.value)} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Full description</Label>
            <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={6} maxLength={5000} aria-invalid={!!fields.description} />
            <Err msgs={fields.description} />
          </div>
        </section>

        <details className="rounded-xl border bg-background p-5">
          <summary className="cursor-pointer text-sm font-semibold">More options (SKU, inventory, SEO)</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-sku">SKU</Label>
              <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={64} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-stock">Stock quantity</Label>
              <Input id="p-stock" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Not tracked" aria-invalid={!!fields.stockQuantity} />
              <Err msgs={fields.stockQuantity} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-avail">Availability</Label>
              <select id="p-avail" value={availability} onChange={(e) => setAvailability(e.target.value as typeof availability)} className={SELECT}>
                <option value="in_stock">In stock</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-compare">Compare-at price ({currency})</Label>
              <Input id="p-compare" inputMode="decimal" value={compareAt} onChange={(e) => setCompareAt(e.target.value)} placeholder="Original price" aria-invalid={!!fields.compareAtPriceCents} />
              <Err msgs={fields.compareAtPriceCents} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-slug">URL name</Label>
              <Input id="p-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="auto-generated from the name" aria-invalid={!!fields.slug} />
              <Err msgs={fields.slug} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-seot">SEO title</Label>
              <Input id="p-seot" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={70} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-seod">SEO description</Label>
              <Textarea id="p-seod" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} maxLength={160} />
            </div>
            {can.publish && (
              <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
                <span>Feature on the storefront homepage</span>
                <Switch checked={featured} onCheckedChange={setFeatured} aria-label="Featured product" />
              </label>
            )}
          </div>
        </details>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <div className="space-y-3 rounded-xl border bg-background p-5">
          <p className="text-sm text-muted-foreground">
            Status: <strong className="text-foreground">{current === "active" ? "Live" : current === "draft" ? "Draft" : "Archived"}</strong>
          </p>
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
          {product ? (
            <Button type="submit" className="w-full" disabled={isBusy}>{busy === current && <Loader2 className="size-3.5 animate-spin" />}Save changes</Button>
          ) : (
            <Button type="button" variant="outline" className="w-full" disabled={isBusy} onClick={() => void submit("draft")}>{busy === "draft" && <Loader2 className="size-3.5 animate-spin" />}Save as draft</Button>
          )}
          {can.publish && current !== "active" && (
            <Button type="button" className="w-full" disabled={isBusy} onClick={() => void submit("active")}>{busy === "active" && <Loader2 className="size-3.5 animate-spin" />}{product ? "Save & publish" : "Publish"}</Button>
          )}
          {can.publish && product && current === "active" && (
            <Button type="button" variant="outline" className="w-full" disabled={isBusy} onClick={() => void submit("draft")}>Save & unpublish</Button>
          )}
          {!can.publish && <p className="text-xs text-muted-foreground">Your role can save drafts; a manager or admin publishes products.</p>}
          <Link href={`/b/${businessId}/products`} className={buttonVariants({ variant: "ghost", className: "w-full" })}>Cancel</Link>
        </div>
      </aside>

      <CategoryDialog
        businessId={businessId}
        open={catDialog}
        onOpenChange={setCatDialog}
        canUploadImages={can.upload}
        onSaved={(c) => {
          // Keep every value typed into the product form: just add the new category and select it.
          setCategories((prev) => [...prev, { id: c.id, name: c.name, active: c.active }]);
          setCategoryId(c.id);
          setCatDialog(false);
        }}
      />
    </form>
  );
}
