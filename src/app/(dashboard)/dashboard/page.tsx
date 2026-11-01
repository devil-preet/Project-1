import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Globe, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requirePageSession } from "@/lib/auth/session";
import { getMemberships } from "@/lib/auth/tenant";
import { ROLE_LABELS } from "@/lib/permissions";
import { getLastBusinessId, pickActiveBusiness } from "@/services/business.service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageSession();
  const memberships = await getMemberships(session.uid);
  const sp = await searchParams;
  const requested = typeof sp.b === "string" ? sp.b : null;

  // A requested workspace id is honoured only if it matches one of the caller's memberships.
  const picked = pickActiveBusiness(memberships, requested, await getLastBusinessId(session.uid));
  if (!picked) redirect("/onboarding");
  const { active, requestedDenied } = picked;
  const { business } = active;

  return (
    <div className="space-y-6">
      {requestedDenied && (
        <p role="status" className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
          That workspace isn&apos;t available to your account, so we opened one of yours instead.
        </p>
      )}

      <section className="rounded-xl border bg-background p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active business</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{business.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Globe className="size-3.5" aria-hidden /> yourplatform.com/s/{business.slug}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" aria-label={`Your role: ${ROLE_LABELS[active.role]}`}>{ROLE_LABELS[active.role]}</Badge>
            <Badge variant="outline">{business.storeStatus === "published" ? "Published" : "Private"}</Badge>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Your workspace is set up. Manage categories, products and your storefront from the workspace.
        </p>
        <Link href={`/b/${active.businessId}/overview`} className={buttonVariants({ className: "mt-4" })}>Open workspace</Link>
      </section>

      <section className="rounded-xl border bg-background shadow-sm">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Your businesses</h2>
          <Link href="/onboarding?new=1" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Plus className="size-3.5" /> New business
          </Link>
        </header>
        <ul className="divide-y">
          {memberships.map((m) => (
            <li key={m.businessId}>
              <Link
                href={`/dashboard?b=${m.businessId}`}
                aria-current={m.businessId === active.businessId ? "true" : undefined}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0 truncate font-medium">{m.business.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {ROLE_LABELS[m.role]}
                  {m.businessId === active.businessId && <Badge>Active</Badge>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
