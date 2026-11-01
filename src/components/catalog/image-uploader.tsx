"use client";

import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEDIA_MAX_BYTES } from "@/lib/validations/catalog";

export interface ImageItem {
  mediaId: string;
  url: string;
}
interface Pending {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

const TYPES = ["image/png", "image/jpeg", "image/webp"];

/** XHR (not fetch) so we can report real upload progress. Carries the CSRF header our API requires. */
function upload(url: string, file: File, onProgress: (pct: number) => void): Promise<{ ok: true; media: ImageItem } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Requested-With", "fetch");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => resolve({ ok: false, error: "Network error. Check your connection and try again." });
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        resolve(body.ok ? { ok: true, media: { mediaId: body.media.mediaId, url: body.media.url } } : { ok: false, error: body.error ?? "Upload failed." });
      } catch {
        resolve({ ok: false, error: "Upload failed." });
      }
    };
    const form = new FormData();
    form.set("file", file);
    xhr.send(form);
  });
}

export function ImageUploader({
  businessId, value, onChange, max = 10, label = "Images", help,
}: {
  businessId: string;
  value: ImageItem[];
  /** Receives an updater (pass React's setState) so concurrent uploads never overwrite each other. */
  onChange: (update: (prev: ImageItem[]) => ImageItem[]) => void;
  max?: number;
  label?: string;
  help?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = max - value.length - pending.length;
    const list = Array.from(files).slice(0, Math.max(room, 0));
    if (files.length > list.length) setError(`You can add up to ${max} images.`);
    for (const file of list) {
      if (!TYPES.includes(file.type)) { setError(`${file.name}: use a PNG, JPEG or WebP image.`); continue; }
      if (file.size > MEDIA_MAX_BYTES) { setError(`${file.name}: images must be 8 MB or smaller.`); continue; }
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setPending((p) => [...p, { key, name: file.name, progress: 0 }]);
      const res = await upload(`/api/b/${businessId}/media`, file, (progress) =>
        setPending((p) => p.map((x) => (x.key === key ? { ...x, progress } : x))),
      );
      setPending((p) => p.filter((x) => x.key !== key));
      if (res.ok) onChange((prev) => [...prev, res.media]);
      else setError(`${file.name}: ${res.error}`);
    }
    if (input.current) input.current.value = "";
  }

  const makeCover = (i: number) => onChange((prev) => [prev[i], ...prev.filter((_, j) => j !== i)]);
  const remove = (i: number) => onChange((prev) => prev.filter((_, j) => j !== i));
  const full = value.length + pending.length >= max;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{value.length}/{max} · PNG, JPEG or WebP, up to 8 MB</span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {value.map((img, i) => (
          <li key={img.mediaId} className={cn("group relative overflow-hidden rounded-lg border bg-transparent", i === 0 && "ring-2 ring-primary")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route; not optimisable by next/image */}
            <img src={img.url} alt={i === 0 ? "Cover image" : `Image ${i + 1}`} className="aspect-square w-full object-cover" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">Cover</span>}
            <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
              {i !== 0 ? (
                <Button type="button" size="xs" variant="secondary" onClick={() => makeCover(i)} aria-label={`Make image ${i + 1} the cover`}>
                  <Star className="size-3" /> Cover
                </Button>
              ) : <span />}
              <Button type="button" size="icon-xs" variant="destructive" onClick={() => remove(i)} aria-label={`Remove image ${i + 1}`}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.key} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border bg-transparent p-2 text-center" aria-live="polite">
            <span className="line-clamp-1 text-xs text-muted-foreground">{p.name}</span>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-all" style={{ width: `${p.progress}%` }} />
            </div>
            <span className="text-xs tabular-nums">{p.progress}%</span>
          </li>
        ))}
        {!full && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:bg-white/[.04] focus-visible:outline-2"
            >
              <ImagePlus className="size-5" aria-hidden /> Add image
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept={TYPES.join(",")} multiple={max > 1} className="sr-only" aria-label={`${label} file input`} onChange={(e) => void pick(e.target.files)} />
      {help && <p className="mt-2 text-xs text-muted-foreground">{help}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
