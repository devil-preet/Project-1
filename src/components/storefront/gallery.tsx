"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function Gallery({ images }: { images: { url: string; alt: string }[] }) {
  const [i, setI] = useState(0);
  if (images.length === 0) {
    return <div className="flex aspect-square items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--sf-fg)_6%,transparent)] opacity-60"><ImageOff className="size-10" aria-label="No image" /></div>;
  }
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[i].url} alt={images[i].alt} className="aspect-square w-full rounded-2xl object-cover" />
      {images.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-2" aria-label="Product images">
          {images.map((img, idx) => (
            <li key={img.url}>
              <button type="button" onClick={() => setI(idx)} aria-label={`Show image ${idx + 1}`} aria-pressed={idx === i} className={cn("overflow-hidden rounded-lg border-2", idx === i ? "border-[var(--sf-primary)]" : "border-transparent opacity-70 hover:opacity-100")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
