import Link from "next/link";
import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProductDTO } from "@/lib/catalog/types";
import { formatMoney } from "@/lib/utils/money";
import { ProductRowActions } from "./product-row-actions";

const STATUS_LABEL = { draft: "Draft", active: "Live", archived: "Archived" } as const;
const STATUS_TONE = { draft: "text-[var(--nv-warm)]", active: "text-[var(--nv-ok)]", archived: "text-muted-foreground" } as const;

export function ProductCard({
  businessId, product: p, can, index = 0,
}: { businessId: string; product: ProductDTO; can: { write: boolean; publish: boolean; delete: boolean }; index?: number }) {
  return (
    <li style={{ ["--i" as string]: Math.min(index, 14) }} className="group nv-rise nv-panel nv-panel-hover nv-panel-lift flex flex-col">
      <Link
        href={`/b/${businessId}/products/${p.id}`}
        className="relative m-2 mb-0 block aspect-[4/5] overflow-hidden rounded-[18px] bg-white/[.03]"
        aria-label={`Edit ${p.name}`}
      >
        {p.primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route
          <img src={p.primaryImage.url} alt={p.primaryImage.alt} loading="lazy" className="size-full object-cover transition-transform duration-700 ease-[var(--nv-ease)] group-hover:scale-[1.06]" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground"><ImageOff className="size-7" aria-hidden /><span className="text-xs">No image</span></div>
        )}
        <Badge className={`absolute left-2.5 top-2.5 ${STATUS_TONE[p.status]}`} variant="secondary">{STATUS_LABEL[p.status]}</Badge>
        {p.featured && <Badge className="absolute right-2.5 top-2.5" variant="outline">Featured</Badge>}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3.5">
        <h2 className="line-clamp-2 min-h-10 text-[15px] leading-5 font-bold">{p.name}</h2>
        <p className="nv-mono truncate text-[11.5px] text-muted-foreground">{p.categoryName || "No category"}</p>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <span className="nv-mono text-[15px] font-semibold tabular-nums">{formatMoney(p.priceCents, p.currency)}</span>
          <span className={p.availability === "in_stock" ? "nv-mono text-[11.5px] text-[var(--nv-ok)]" : "nv-mono text-[11.5px] text-[var(--nv-warm)]"}>
            {p.availability === "in_stock" ? "In stock" : "Out of stock"}
          </span>
        </div>
        <ProductRowActions businessId={businessId} product={{ id: p.id, name: p.name, status: p.status, hasImage: p.images.length > 0 }} can={can} />
      </div>
    </li>
  );
}
