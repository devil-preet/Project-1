import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ActionHandler } from "@/components/auth/action-handler";

export const metadata: Metadata = { title: "Account action" };

export default async function ActionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const mode = one(sp.mode);
  return (
    <AuthShell title={mode === "resetPassword" ? "Choose a new password" : mode === "verifyEmail" ? "Verify your email" : "Account action"}>
      <ActionHandler mode={mode} oobCode={one(sp.oobCode)} />
    </AuthShell>
  );
}
