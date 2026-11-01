import Link from "next/link";
import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProductDTO } from "@/lib/catalog/types";
import { formatMoney } from "@/lib/utils/money";
import { ProductRowActions } from "./product-row-actions";

const STATUS_LABEL = { draft: "Draft", active: "Live", archived: "Archived" } as const;

export function ProductCard({
  businessId, product: p, can,
}: { businessId: string; product: ProductDTO; can: { write: boolean; publish: boolean; delete: boolean } }) {
  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border bg-background">
      <Link href={`/b/${businessId}/products/${p.id}`} className="relative block aspect-square bg-muted/40" aria-label={`Edit ${p.name}`}>
        {p.primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route
          <img src={p.primaryImage.url} alt={p.primaryImage.alt} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground"><ImageOff className="size-7" aria-hidden /><span className="text-xs">No image</span></div>
        )}
        <Badge className="absolute left-2 top-2" variant={p.status === "active" ? "default" : "secondary"}>{STATUS_LABEL[p.status]}</Badge>
        {p.featured && <Badge className="absolute right-2 top-2" variant="outline">Featured</Badge>}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h2 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{p.name}</h2>
        <p className="truncate text-xs text-muted-foreground">{p.categoryName || "No category"}</p>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <span className="font-semibold tabular-nums">{formatMoney(p.priceCents, p.currency)}</span>
          <span className={p.availability === "in_stock" ? "text-xs text-emerald-700 dark:text-emerald-400" : "text-xs text-amber-700 dark:text-amber-400"}>
            {p.availability === "in_stock" ? "In stock" : "Out of stock"}
          </span>
        </div>
        <ProductRowActions businessId={businessId} product={{ id: p.id, name: p.name, status: p.status, hasImage: p.images.length > 0 }} can={can} />
      </div>
    </li>
  );
}
