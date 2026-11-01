import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { can, type Permission } from "@/lib/permissions";
import type { Membership, Role } from "@/types";
import { authorizeMember } from "./guard";
import { requirePageSession, type Session } from "./session";
import { getMemberships } from "./tenant";

export interface Workspace {
  session: Session;
  businessId: string;
  role: Role;
  business: Membership["business"];
  memberships: Membership[];
  can: (p: Permission) => boolean;
}

/**
 * Page-level tenant gate. EVERY /b/[businessId]/* page calls this itself (layouts do not re-run on
 * client navigations): verified session -> membership + role permission from members/{uid}.
 * Any failure renders the same 404 so a visitor cannot tell "no such business" from "not yours".
 */
export const requireWorkspace = cache(async (businessId: string, permission: Permission = "business:view"): Promise<Workspace> => {
  const session = await requirePageSession();
  let role: Role;
  try {
    role = await authorizeMember(adminDb(), session.uid, businessId, permission);
  } catch {
    notFound();
  }
  const memberships = await getMemberships(session.uid);
  const mine = memberships.find((m) => m.businessId === businessId);
  if (!mine) notFound();
  return { session, businessId, role, business: mine.business, memberships, can: (p) => can(role, p) };
});
