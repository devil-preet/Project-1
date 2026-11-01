import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/session";
import { getMemberships } from "@/lib/auth/tenant";
import { LogoutButton } from "@/components/auth/logout-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Independent of proxy.ts: verifies the cookie, revocation and email verification.
  const session = await requirePageSession();
  // Tenant gate: no memberships -> onboarding. Access is derived only from members/{uid} docs.
  const memberships = await getMemberships(session.uid);
  if (memberships.length === 0) redirect("/onboarding");

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="flex h-14 items-center justify-between border-b bg-background px-4 sm:px-6">
        <span className="text-sm font-semibold tracking-tight">Brand Portal</span>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{session.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-8">{children}</main>
    </div>
  );
}
