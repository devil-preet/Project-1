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
    <div className="min-h-svh">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between bg-[linear-gradient(180deg,rgba(16,14,19,.94),rgba(16,14,19,.6)_70%,transparent)] px-4 sm:px-8">
        <span className="flex items-center gap-3 font-heading text-sm font-semibold tracking-tight"><span className="flex size-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#EAD7FA,#C69CE9)] text-primary-foreground">N</span>Brand Portal</span>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{session.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-4 sm:px-8">{children}</main>
    </div>
  );
}
