import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/workspace/page-bits";
import { buttonVariants } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/workspace";
import { adminDb } from "@/lib/firebase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ws = await requireWorkspace(businessId);
  const db = adminDb();
  const products = db.collection(`businesses/${businessId}/products`);
  const [cats, total, active, draft] = await Promise.all([
    db.collection(`businesses/${businessId}/categories`).count().get(),
    products.count().get(),
    products.where("status", "==", "active").count().get(),
    products.where("status", "==", "draft").count().get(),
  ]);
  const n = { categories: cats.data().count, products: total.data().count, active: active.data().count, draft: draft.data().count };
  const published = ws.business.storeStatus === "published";

  const steps = [
    { done: n.categories > 0, label: "Create your first category", href: `/b/${businessId}/categories`, perm: ws.can("category:write") },
    { done: n.products > 0, label: "Add a product", href: `/b/${businessId}/products/new`, perm: ws.can("product:write") },
    { done: n.active > 0, label: "Publish a product (needs an image)", href: `/b/${businessId}/products`, perm: ws.can("product:publish") },
    { done: published, label: "Publish your store", href: `/b/${businessId}/settings`, perm: ws.can("settings:update") },
  ];
  const stats = [
    { label: "Categories", value: n.categories },
    { label: "Products", value: n.products },
    { label: "Live products", value: n.active },
    { label: "Drafts", value: n.draft },
  ];

  return (
    <>
      <PageHeader
        title={ws.business.name}
        description={published ? "Your store is live." : "Your store is private. Publish it from Settings when you're ready."}
        actions={
          published ? (
            <Link href={`/s/${ws.business.slug}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
              View store <ExternalLink className="size-3.5" />
            </Link>
          ) : undefined
        }
      />
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-background p-4">
            <dt className="text-xs font-medium text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-6 rounded-xl border bg-background">
        <h2 className="border-b px-5 py-3 text-sm font-semibold">Getting started</h2>
        <ul className="divide-y">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="flex items-center gap-2">
                {s.done ? <CheckCircle2 className="size-4 text-emerald-600" aria-label="Done" /> : <Circle className="size-4 text-muted-foreground" aria-label="To do" />}
                <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
              </span>
              {!s.done && s.perm && <Link href={s.href} className={buttonVariants({ variant: "outline", size: "sm" })}>Go</Link>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
