"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/api/client";
import type { CategoryDTO } from "@/lib/catalog/types";
import { ImageUploader, type ImageItem } from "./image-uploader";

export function CategoryDialog({
  businessId, open, onOpenChange, category, onSaved, canUploadImages,
}: {
  businessId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category?: CategoryDTO;
  onSaved: (c: CategoryDTO) => void;
  canUploadImages: boolean;
}) {
  // Re-mount the form body whenever the target changes so state always starts from the right record.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <CategoryForm key={category?.id ?? "new"} businessId={businessId} category={category} onSaved={onSaved} onCancel={() => onOpenChange(false)} canUploadImages={canUploadImages} />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  businessId, category, onSaved, onCancel, canUploadImages,
}: { businessId: string; category?: CategoryDTO; onSaved: (c: CategoryDTO) => void; onCancel: () => void; canUploadImages: boolean }) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [active, setActive] = useState(category?.active ?? true);
  const [image, setImage] = useState<ImageItem[]>(category?.image ? [{ mediaId: category.image.mediaId, url: category.image.url }] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // The dialog is portalled but React bubbles its events to a parent <form> (the product form) — stop that.
    e.stopPropagation();
    setBusy(true);
    setError(null);
    setFields({});
    const body = { name, slug, description, active, imageId: image[0]?.mediaId ?? null };
    const res = await postJson<{ category: CategoryDTO }>(`/api/b/${businessId}/categories`, category ? { action: "update", id: category.id, ...body } : { action: "create", ...body });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setFields(res.fieldErrors ?? {});
      return;
    }
    onSaved(res.category);
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
        <DialogDescription>Categories group your products on the storefront.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="cat-name">Name</Label>
        <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={!!fields.name} autoFocus />
        <p className="min-h-4 text-xs text-destructive">{fields.name?.[0]}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cat-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
      </div>
      {canUploadImages && <ImageUploader businessId={businessId} label="Category image (optional)" max={1} value={image} onChange={setImage} />}
      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="cat-slug">URL name</Label>
          <Input id="cat-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="auto-generated from the name" aria-invalid={!!fields.slug} />
          <p className="min-h-4 text-xs text-destructive">{fields.slug?.[0]}</p>
        </div>
      </details>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Visible on the storefront</span>
        <Switch checked={active} onCheckedChange={setActive} aria-label="Visible on the storefront" />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-3.5 animate-spin" />}{category ? "Save changes" : "Create category"}</Button>
      </DialogFooter>
    </form>
  );
}
