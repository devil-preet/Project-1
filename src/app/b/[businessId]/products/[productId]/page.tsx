import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/catalog/product-form";
import { NoAccess, PageHeader } from "@/components/workspace/page-bits";
import { requireWorkspace } from "@/lib/auth/workspace";
import { idSchema } from "@/lib/validations/catalog";
import { listCategoryOptions } from "@/services/category.service";
import { getProduct, storeCurrency } from "@/services/product.service";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ businessId: string; productId: string }> }) {
  const { businessId, productId } = await params;
  const ws = await requireWorkspace(businessId, "business:view");
  if (!ws.can("product:write")) return <NoAccess what="editing products" />;
  if (!idSchema.safeParse(productId).success) notFound();
  // The product is read from THIS business's collection only; an id from another tenant simply does not exist here.
  const [product, categories, currency] = await Promise.all([getProduct(businessId, productId), listCategoryOptions(businessId), storeCurrency(businessId)]);
  if (!product) notFound();
  return (
    <>
      <PageHeader title={product.name} description="Edit product details, photos and visibility." />
      <ProductForm
        key={product.id + product.updatedAt}
        businessId={businessId}
        currency={product.currency || currency}
        categories={categories}
        product={product}
        can={{ publish: ws.can("product:publish"), categoryWrite: ws.can("category:write"), upload: ws.can("media:upload") }}
      />
    </>
  );
}
