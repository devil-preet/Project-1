import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyPanel } from "@/components/auth/verify-panel";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage() {
  const session = await requirePageSession({ verified: false });
  if (session.emailVerified) redirect("/dashboard");
  return (
    <AuthShell title="Verify your email">
      <VerifyPanel email={session.email} />
    </AuthShell>
  );
}
