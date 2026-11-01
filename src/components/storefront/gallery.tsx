"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function Gallery({ images }: { images: { url: string; alt: string }[] }) {
  const [i, setI] = useState(0);
  if (images.length === 0) {
    return <div className="flex aspect-[4/5] items-center justify-center rounded-[34px] border border-[color:var(--sf-line-strong)] bg-[var(--sf-surface)] opacity-70"><ImageOff className="size-10" aria-label="No image" /></div>;
  }
  return (
    <div>
      <div className="overflow-hidden rounded-[34px] border border-[color:var(--sf-line-strong)] bg-[var(--sf-surface)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i].url} alt={images[i].alt} className="aspect-[4/5] w-full object-cover" />
      </div>
      {images.length > 1 && (
        <ul className="mt-4 grid grid-cols-5 gap-3" aria-label="Product images">
          {images.map((img, idx) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setI(idx)}
                aria-label={`Show image ${idx + 1}`}
                aria-pressed={idx === i}
                className={cn("w-full overflow-hidden rounded-2xl border-2 transition-opacity", idx === i ? "border-[var(--sf-accent)]" : "border-transparent opacity-65 hover:opacity-100")}
              >
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
