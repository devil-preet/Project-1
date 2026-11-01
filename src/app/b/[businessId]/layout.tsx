import Link from "next/link";
import { ChevronsUpDown, ExternalLink } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { WorkspaceNav, type NavKey } from "@/components/workspace/workspace-nav";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="flex h-14 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" className="hidden text-sm font-semibold tracking-tight sm:inline">Brand Portal</Link>
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span className="max-w-[10rem] truncate">{ws.business.name}</span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
            </summary>
            <ul className="absolute left-0 z-20 mt-1 w-64 rounded-lg border bg-background p-1 shadow-lg">
              {ws.memberships.map((m) => (
                <li key={m.businessId}>
                  <Link
                    href={`/b/${m.businessId}/overview`}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    aria-current={m.businessId === businessId ? "true" : undefined}
                  >
                    <span className="truncate">{m.business.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>
                  </Link>
                </li>
              ))}
              <li className="border-t pt-1">
                <Link href="/onboarding?new=1" className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted">+ New business</Link>
              </li>
            </ul>
          </details>
          <Badge variant="secondary" className="hidden sm:inline-flex">{ROLE_LABELS[ws.role]}</Badge>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {ws.business.storeStatus === "published" && (
            <Link href={`/s/${ws.business.slug}`} target="_blank" className="hidden items-center gap-1 hover:text-foreground sm:inline-flex">
              View store <ExternalLink className="size-3" aria-hidden />
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:p-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
        <aside className="min-w-0 md:sticky md:top-6 md:self-start">
          <WorkspaceNav businessId={businessId} visible={visible} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
