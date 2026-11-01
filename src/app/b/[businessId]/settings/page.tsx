import type { Metadata } from "next";
import { PublishToggle, StoreForm } from "@/components/catalog/settings-forms";
import { NoAccess, PageHeader } from "@/components/workspace/page-bits";
import { requireWorkspace } from "@/lib/auth/workspace";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_CURRENCY, isCurrency } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ws = await requireWorkspace(businessId, "business:view");
  if (!ws.can("settings:update")) return <><PageHeader title="Settings" /><NoAccess what="store settings" /></>;

  const db = adminDb();
  const [store, products] = await Promise.all([
    db.doc(`businesses/${businessId}/settings/store`).get(),
    db.collection(`businesses/${businessId}/products`).count().get(),
  ]);
  const count = products.data().count;
  return (
    <>
      <PageHeader title="Settings" description="Store identity, currency and visibility." />
      <div className="space-y-5">
        <PublishToggle businessId={businessId} published={ws.business.storeStatus === "published"} productCount={count} />
        <StoreForm
          businessId={businessId}
          currencyLocked={count > 0}
          initial={{
            displayName: String(store.get("displayName") ?? ws.business.name),
            description: String(store.get("description") ?? ""),
            currency: isCurrency(store.get("currency")) ? store.get("currency") : DEFAULT_CURRENCY,
          }}
        />
      </div>
    </>
  );
}
