import type { Metadata } from "next";
import { BrandingForm } from "@/components/catalog/settings-forms";
import { NoAccess, PageHeader } from "@/components/workspace/page-bits";
import { requireWorkspace } from "@/lib/auth/workspace";
import { adminDb } from "@/lib/firebase/admin";
import { adminMediaUrl } from "@/services/media.service";
import type { MediaRef } from "@/types";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ws = await requireWorkspace(businessId, "business:view");
  if (!ws.can("branding:update")) return <><PageHeader title="Branding" /><NoAccess what="branding" /></>;
  const b = await adminDb().doc(`businesses/${businessId}/settings/branding`).get();
  const logo = b.get("logo") as MediaRef | null | undefined;
  return (
    <>
      <PageHeader title="Branding" description="Logo and colours used on your storefront." />
      <BrandingForm
        key={String(b.updateTime?.toMillis())}
        businessId={businessId}
        storeName={String(b.get("displayName") ?? ws.business.name)}
        canUpload={ws.can("media:upload")}
        initial={{
          primaryColor: String(b.get("primaryColor") ?? "#111827"),
          secondaryColor: String(b.get("secondaryColor") ?? "#6B7280"),
          accentColor: String(b.get("accentColor") ?? "#2563EB"),
          defaultTheme: b.get("defaultTheme") === "dark" ? "dark" : "light",
          logo: logo?.mediaId ? { mediaId: logo.mediaId, url: adminMediaUrl(businessId, logo.mediaId) } : null,
        }}
      />
    </>
  );
}
