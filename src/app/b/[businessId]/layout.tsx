import Link from "next/link";
import { ChevronsUpDown, ExternalLink } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { WorkspaceNav, type NavKey } from "@/components/workspace/workspace-nav";
import { requireWorkspace } from "@/lib/auth/workspace";
import { ROLE_LABELS } from "@/lib/permissions";

export default async function WorkspaceLayout({
  children,
  params,
}: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ws = await requireWorkspace(businessId);
  const visible: NavKey[] = ["overview", "products", "categories", "media", "team"];
  if (ws.can("branding:update")) visible.push("branding");
  if (ws.can("settings:update")) visible.push("settings");
  const published = ws.business.storeStatus === "published";

  return (
    <div className="min-h-svh">
      <WorkspaceNav businessId={businessId} visible={visible} storeSlug={published ? ws.business.slug : null} />
      <div className="md:ml-24">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-[linear-gradient(180deg,rgba(16,14,19,.94),rgba(16,14,19,.6)_70%,transparent)] px-4 py-3.5 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-full border border-[var(--nv-line-strong)] bg-white/[.05] px-4 py-2 text-sm font-bold backdrop-blur-md transition-colors hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                <span className="nv-pulse !mr-0" aria-hidden />
                <span className="max-w-[10rem] truncate sm:max-w-[16rem]">{ws.business.name}</span>
                <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
              </summary>
              <ul className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-[var(--nv-line-strong)] bg-[rgba(27,23,32,.97)] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,.6)] backdrop-blur-xl">
                {ws.memberships.map((m) => (
                  <li key={m.businessId}>
                    <Link
                      href={`/b/${m.businessId}/overview`}
                      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm hover:bg-[rgba(217,184,244,.09)] aria-[current=true]:bg-[rgba(217,184,244,.12)] aria-[current=true]:text-primary"
                      aria-current={m.businessId === businessId ? "true" : undefined}
                    >
                      <span className="truncate font-semibold">{m.business.name}</span>
                      <span className="nv-label shrink-0 !text-[10px]">{ROLE_LABELS[m.role]}</span>
                    </Link>
                  </li>
                ))}
                <li className="mt-1 border-t border-[var(--nv-line)] pt-1">
                  <Link href="/onboarding?new=1" className="block rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-[rgba(217,184,244,.09)] hover:text-foreground">+ New business</Link>
                </li>
                <li>
                  <Link href="/dashboard" className="block rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-[rgba(217,184,244,.09)] hover:text-foreground">All businesses</Link>
                </li>
              </ul>
            </details>
            <span className="nv-label hidden rounded-full border border-[var(--nv-line)] px-3 py-1.5 sm:inline-block">{ROLE_LABELS[ws.role]}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {published && (
              <Link href={`/s/${ws.business.slug}`} target="_blank" className="hidden items-center gap-1.5 rounded-full border border-[var(--nv-line-strong)] bg-white/[.04] px-4 py-2 font-semibold text-foreground transition-colors hover:bg-white/10 sm:inline-flex">
                View store <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            )}
            <LogoutButton />
          </div>
        </header>
        <main className="mx-auto max-w-[1520px] px-4 pb-32 pt-4 sm:px-7 md:pb-20 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
