import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Store } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { OnboardingWizard, type WizardInitial } from "@/components/onboarding/wizard";
import { requirePageSession } from "@/lib/auth/session";
import { listMemberships } from "@/services/business.service";
import { getOnboardingState } from "@/services/onboarding.service";

export const metadata: Metadata = { title: "Set up your business" };

export default async function OnboardingPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Authoritative checks: valid session AND verified email (unverified users go to /verify-email).
  const session = await requirePageSession();
  const sp = await searchParams;
  const wantsNew = sp.new === "1";

  const [memberships, state] = await Promise.all([listMemberships(session.uid), getOnboardingState(session.uid)]);
  // Already has a workspace: onboarding is done unless they explicitly start another business.
  if (memberships.length > 0 && !wantsNew) redirect("/dashboard");

  const resumable = state.status === "IN_PROGRESS" ? state.draft : null;
  const initial: WizardInitial = {
    step: resumable?.step ?? 1,
    values: (resumable?.data ?? {}) as WizardInitial["values"],
    logo: resumable?.logo ? { fileName: resumable.logo.fileName } : null,
    needsFresh: state.status === "COMPLETED",
    userEmail: session.email,
    isAdditional: memberships.length > 0,
  };

  return (
    <div className="min-h-svh">
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground"><Store className="size-3.5" /></span>
          Brand Portal
        </span>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{session.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-6">
          <h1 className="nv-title text-[clamp(26px,3.6vw,40px)]">
            {initial.isAdditional ? "Create another business" : `Welcome${session.name ? `, ${session.name.split(" ")[0]}` : ""} — let's set up your business`}
          </h1>
          {resumable && <p className="mt-1 text-sm text-muted-foreground">We saved your progress. Pick up where you left off.</p>}
        </div>
        <div className="nv-panel p-5 sm:p-8">
          <OnboardingWizard initial={initial} />
        </div>
      </main>
    </div>
  );
}
