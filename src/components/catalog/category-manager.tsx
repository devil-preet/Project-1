"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, FolderTree, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/workspace/page-bits";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { postJson } from "@/lib/api/client";
import type { CategoryDTO } from "@/lib/catalog/types";
import { CategoryDialog } from "./category-dialog";

export function CategoryManager({
  businessId, items, nextCursor, q, can,
}: {
  businessId: string;
  items: CategoryDTO[];
  nextCursor: string | null;
  q: string;
  can: { write: boolean; delete: boolean; upload: boolean };
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ open: boolean; category?: CategoryDTO }>({ open: false });
  const [confirm, setConfirm] = useState<CategoryDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, body: object) {
    setBusyId(id);
    setError(null);
    const res = await postJson(`/api/b/${businessId}/categories`, body);
    setBusyId(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
    return res.ok;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form role="search" className="relative w-full max-w-xs" action={`/b/${businessId}/categories`}>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search categories" aria-label="Search categories" className="pl-8" />
        </form>
        {can.write && <Button onClick={() => setDialog({ open: true })}><Plus className="size-3.5" /> New category</Button>}
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        q ? (
          <EmptyState icon={<Search className="size-5" />} title="No matching categories" body={`Nothing starts with “${q}”.`} action={<Link href={`/b/${businessId}/categories`} className={buttonVariants({ variant: "outline" })}>Clear search</Link>} />
        ) : (
          <EmptyState
            icon={<FolderTree className="size-5" />}
            title="No categories yet"
            body="Create a category first, then add products to it."
            action={can.write ? <Button onClick={() => setDialog({ open: true })}><Plus className="size-3.5" /> Create your first category</Button> : undefined}
          />
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c, i) => (
            <li key={c.id} className="flex flex-col nv-panel nv-panel-hover overflow-hidden">
              <div className="relative aspect-[16/10] bg-white/[.03]">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route
                  <img src={c.image.url} alt={c.image.alt} className="absolute inset-0 size-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground"><FolderTree className="size-8" aria-hidden /></div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 truncate font-heading text-[17px] font-semibold tracking-tight">{c.name}</h2>
                  <Badge variant={c.active ? "secondary" : "outline"}>{c.active ? "Active" : "Hidden"}</Badge>
                </div>
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{c.description || "No description"}</p>
                <p className="text-xs text-muted-foreground">
                  <Link href={`/b/${businessId}/products?categoryId=${c.id}`} className="underline-offset-2 hover:underline">
                    {c.productCount} product{c.productCount === 1 ? "" : "s"}
                  </Link>
                </p>
                {can.write && (
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch size="sm" checked={c.active} disabled={busyId === c.id} onCheckedChange={(v) => void act(c.id, { action: "setActive", id: c.id, active: v })} aria-label={`${c.name} visible on storefront`} />
                      Visible
                    </label>
                    <div className="flex items-center gap-1">
                      {busyId === c.id && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Working" />}
                      {!q && (
                        <>
                          <Button size="icon-xs" variant="ghost" disabled={i === 0 || busyId === c.id} onClick={() => void act(c.id, { action: "move", id: c.id, direction: "up" })} aria-label={`Move ${c.name} up`}><ArrowUp /></Button>
                          <Button size="icon-xs" variant="ghost" disabled={(i === items.length - 1 && !nextCursor) || busyId === c.id} onClick={() => void act(c.id, { action: "move", id: c.id, direction: "down" })} aria-label={`Move ${c.name} down`}><ArrowDown /></Button>
                        </>
                      )}
                      <Button size="icon-xs" variant="ghost" onClick={() => setDialog({ open: true, category: c })} aria-label={`Edit ${c.name}`}><Pencil /></Button>
                      {can.delete && <Button size="icon-xs" variant="ghost" onClick={() => setConfirm(c)} aria-label={`Delete ${c.name}`}><Trash2 /></Button>}
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-6 text-center">
          <Link href={`/b/${businessId}/categories?${new URLSearchParams({ ...(q ? { q } : {}), cursor: nextCursor })}`} className={buttonVariants({ variant: "outline" })}>Next page</Link>
        </div>
      )}

      <CategoryDialog
        businessId={businessId}
        open={dialog.open}
        category={dialog.category}
        canUploadImages={can.upload}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSaved={() => { setDialog({ open: false }); router.refresh(); }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && confirm.productCount > 0
                ? `This category still has ${confirm.productCount} product${confirm.productCount === 1 ? "" : "s"}, so it can't be deleted. Move or delete those products first.`
                : "This permanently removes the category. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {confirm && confirm.productCount === 0 && (
              <AlertDialogAction variant="destructive" onClick={() => { const id = confirm.id; setConfirm(null); void act(id, { action: "delete", id }); }}>
                Delete category
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
