import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/workspace/page-bits";
import { requireWorkspace } from "@/lib/auth/workspace";
import { adminDb } from "@/lib/firebase/admin";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/types";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  await requireWorkspace(businessId, "team:view");
  const snap = await adminDb().collection(`businesses/${businessId}/members`).limit(100).get();
  const members = snap.docs.map((d) => ({ uid: d.id, name: String(d.get("fullName") ?? ""), email: String(d.get("email") ?? ""), role: d.get("role") as Role }));
  return (
    <>
      <PageHeader title="Team" description="People with access to this business. Invitations and role changes arrive in a later release." />
      <ul className="nv-panel divide-y divide-[var(--nv-line)] overflow-hidden">
        {members.map((m) => (
          <li key={m.uid} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">{m.name || m.email}</span>
              <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
            </span>
            <Badge variant="secondary">{ROLE_LABELS[m.role]}</Badge>
          </li>
        ))}
      </ul>
    </>
  );
}
