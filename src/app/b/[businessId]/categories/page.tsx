import type { Metadata } from "next";
import { CategoryManager } from "@/components/catalog/category-manager";
import { PageHeader } from "@/components/workspace/page-bits";
import { requireWorkspace } from "@/lib/auth/workspace";
import { idSchema } from "@/lib/validations/catalog";
import { listCategories } from "@/services/category.service";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({
  params, searchParams,
}: { params: Promise<{ businessId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { businessId } = await params;
  const ws = await requireWorkspace(businessId, "business:view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const cursor = typeof sp.cursor === "string" && idSchema.safeParse(sp.cursor).success ? sp.cursor : undefined;
  const page = await listCategories(businessId, { q, cursor });

  return (
    <>
      <PageHeader title="Categories" description="Organise products into groups customers can browse." />
      <CategoryManager
        businessId={businessId}
        items={page.items}
        nextCursor={page.nextCursor}
        q={q}
        can={{ write: ws.can("category:write"), delete: ws.can("category:delete"), upload: ws.can("media:upload") }}
      />
    </>
  );
}
