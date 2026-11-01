import type { Role } from "@/types";

/**
 * Role-based access control. Single source of truth for the server-side
 * authorization layer. `firestore.rules` / `storage.rules` independently
 * enforce the coarser read/upload subset of this matrix.
 */
export const PERMISSIONS = [
  "business:view",
  "business:update",
  "business:delete",
  "settings:update",
  "branding:update",
  "team:view",
  "team:invite",
  "team:manage",
  "category:write",
  "category:delete",
  "product:write",
  "product:publish",
  "product:delete",
  "media:upload",
  "media:delete",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(ALL),
  ADMIN: new Set(ALL.filter((p) => p !== "business:delete")),
  MANAGER: new Set<Permission>([
    "business:view",
    "team:view",
    "branding:update",
    "category:write",
    "category:delete",
    "product:write",
    "product:publish",
    "product:delete",
    "media:upload",
    "media:delete",
  ]),
  // Editors author content; they cannot publish, delete, or restructure.
  EDITOR: new Set<Permission>(["business:view", "team:view", "product:write", "media:upload"]),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

const RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, MANAGER: 2, EDITOR: 1 };

/**
 * Team-management hierarchy rules. An actor may only grant or touch roles
 * strictly below their own, so nobody can escalate themselves or a peer.
 * OWNER is never assignable (single owner; transfer is a separate flow).
 */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (!can(actor, "team:manage")) return false;
  if (target === "OWNER") return false;
  return RANK[actor] > RANK[target];
}

/** May `actor` change or remove a member who currently has `current`? */
export function canManageMember(actor: Role, current: Role): boolean {
  return can(actor, "team:manage") && RANK[actor] > RANK[current];
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  EDITOR: "Editor",
};
