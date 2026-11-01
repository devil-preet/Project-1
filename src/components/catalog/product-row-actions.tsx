"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Eye, EyeOff, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { postJson } from "@/lib/api/client";
import type { ProductStatus } from "@/types";

type Confirm = null | "delete" | "archive";

export function ProductRowActions({
  businessId, product, can,
}: {
  businessId: string;
  product: { id: string; name: string; status: ProductStatus; hasImage: boolean };
  can: { write: boolean; publish: boolean; delete: boolean };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  async function run(body: object) {
    setBusy(true);
    setError(null);
    const res = await postJson(`/api/b/${businessId}/products`, body);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }
  const setStatus = (status: ProductStatus) => run({ action: "setStatus", id: product.id, status });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-t pt-2">
        {can.write && (
          <Link href={`/b/${businessId}/products/${product.id}`} className={buttonVariants({ variant: "ghost", size: "xs" })}><Pencil /> Edit</Link>
        )}
        {can.publish && product.status !== "active" && (
          <Button size="xs" variant="ghost" disabled={busy || !product.hasImage} title={product.hasImage ? undefined : "Add an image before publishing"} onClick={() => void setStatus("active")}>
            <Eye /> Publish
          </Button>
        )}
        {can.publish && product.status === "active" && (
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void setStatus("draft")}><EyeOff /> Unpublish</Button>
        )}
        <span className="ml-auto flex items-center gap-1">
          {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Working" />}
          {can.publish && product.status !== "archived" && (
            <Button size="icon-xs" variant="ghost" disabled={busy} onClick={() => setConfirm("archive")} aria-label={`Archive ${product.name}`}><Archive /></Button>
          )}
          {can.delete && <Button size="icon-xs" variant="ghost" disabled={busy} onClick={() => setConfirm("delete")} aria-label={`Delete ${product.name}`}><Trash2 /></Button>}
        </span>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? `Delete “${product.name}”?` : `Archive “${product.name}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "This permanently deletes the product and its images. This can't be undone."
                : "Archived products are hidden from your storefront but kept here. You can restore them later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              onClick={() => { const c = confirm; setConfirm(null); void (c === "delete" ? run({ action: "delete", id: product.id }) : setStatus("archived")); }}
            >
              {confirm === "delete" ? "Delete product" : "Archive product"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
