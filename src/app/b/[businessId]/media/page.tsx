import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/workspace/page-bits";
import { requireWorkspace } from "@/lib/auth/workspace";
import { adminDb } from "@/lib/firebase/admin";
import { adminMediaUrl } from "@/services/media.service";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  await requireWorkspace(businessId, "business:view");
  // Bounded read; deleted assets are filtered in code (no composite index needed).
  const snap = await adminDb().collection(`businesses/${businessId}/media`).orderBy("createdAt", "desc").limit(120).get();
  const items = snap.docs.filter((d) => !d.get("deletedAt"));

  return (
    <>
      <PageHeader title="Media" description="Images uploaded to this business. Add images from the product, category and branding screens." />
      {items.length === 0 ? (
        <EmptyState icon={<ImageIcon className="size-5" />} title="No images yet" body="Images you add to products, categories or your logo appear here." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((d) => (
            <li key={d.id} className="overflow-hidden rounded-xl border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route */}
              <img src={adminMediaUrl(businessId, d.id)} alt={String(d.get("fileName") ?? "Image")} loading="lazy" className="aspect-square w-full object-cover" />
              <p className="truncate px-3 py-2 text-xs text-muted-foreground" title={String(d.get("fileName"))}>
                {String(d.get("fileName"))} · {d.get("ownerType") ?? "unused"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
