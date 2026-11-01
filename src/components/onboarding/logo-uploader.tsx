"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postForm, postJson } from "@/lib/api/client";
import { LOGO_MAX_BYTES } from "@/lib/validations/onboarding";

export interface LogoState {
  fileName: string;
  /** Local object URL for a just-picked file; absent when resuming a saved draft. */
  previewUrl?: string;
}

export function LogoUploader({
  value, onChange, ensureDraft,
}: {
  value: LogoState | null;
  onChange: (v: LogoState | null) => void;
  /** Makes sure a (fresh, when starting a second business) draft exists before uploading. */
  ensureDraft: () => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setError("Use a PNG, JPEG or WebP image.");
    if (file.size > LOGO_MAX_BYTES) return setError("Logo must be 2 MB or smaller.");
    setBusy(true);
    if (!(await ensureDraft())) {
      setBusy(false);
      return setError("Could not save your progress. Please try again.");
    }
    const form = new FormData();
    form.set("file", file);
    const res = await postForm("/api/onboarding/logo", form);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange({ fileName: file.name, previewUrl: URL.createObjectURL(file) });
  }

  async function remove() {
    setBusy(true);
    const res = await postJson("/api/onboarding/draft", { step: 2, data: {}, removeLogo: true });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
          {value?.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview; next/image cannot optimise blob: URLs
            <img src={value.previewUrl} alt="Logo preview" className="size-full object-contain" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0 space-y-1.5">
          {value ? (
            <p className="truncate text-sm font-medium" title={value.fileName}>{value.fileName}</p>
          ) : (
            <p className="text-sm text-muted-foreground">PNG, JPEG or WebP, up to 2 MB.</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {value ? "Replace" : "Upload logo"}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
                <Trash2 className="size-3.5" /> Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Upload logo"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
