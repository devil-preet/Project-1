import type { Metadata } from "next";
import { ProductForm } from "@/components/catalog/product-form";
import { NoAccess, PageHeader } from "@/components/workspace/page-bits";
import { requireWorkspace } from "@/lib/auth/workspace";
import { listCategoryOptions } from "@/services/category.service";
import { storeCurrency } from "@/services/product.service";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ws = await requireWorkspace(businessId, "business:view");
  if (!ws.can("product:write")) return <NoAccess what="adding products" />;
  const [categories, currency] = await Promise.all([listCategoryOptions(businessId), storeCurrency(businessId)]);
  return (
    <>
      <PageHeader title="Add product" description="Name it, pick a category, add photos and a price. The rest is optional." />
      <ProductForm
        businessId={businessId}
        currency={currency}
        categories={categories}
        can={{ publish: ws.can("product:publish"), categoryWrite: ws.can("category:write"), upload: ws.can("media:upload") }}
      />
    </>
  );
}
