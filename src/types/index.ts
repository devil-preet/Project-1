/**
 * Domain types. These are the *serialized* (DTO) shapes that cross the
 * server/client boundary: every timestamp is an ISO-8601 string.
 * Firestore stores the same fields as Timestamps; conversion happens in
 * `lib/firebase/firestore.ts` (`toDTO`).
 */

export const ROLES = ["OWNER", "ADMIN", "MANAGER", "EDITOR"] as const;
export type Role = (typeof ROLES)[number];

export interface Stamped {
  createdAt: string;
  updatedAt: string;
}

/** users/{uid} */
export interface UserProfile extends Stamped {
  uid: string;
  email: string;
  fullName: string;
  photoURL: string | null;
  /** Business the user last worked in; used as the default workspace. */
  lastBusinessId: string | null;
}

export type StoreStatus = "unpublished" | "published";

/** businesses/{businessId} — identity + denormalized fields System 2 needs. */
export interface Business extends Stamped {
  id: string;
  name: string;
  slug: string;
  industry: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  ownerId: string;
  storeStatus: StoreStatus;
  onboarding: BusinessOnboarding;
  /** Future-ready, disabled until System 2 ships. */
  customDomain: string | null;
  subdomain: string | null;
  deletedAt: string | null;
}

/** Workspace-setup state recorded on the business once creation succeeds. */
export interface BusinessOnboarding {
  status: "COMPLETED";
  completedAt: string;
  version: number;
}

export type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

/** Uploaded-but-not-yet-attached logo held in the onboarding draft. */
export interface DraftLogo {
  mediaId: string;
  storagePath: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  fileName: string;
}

/**
 * users/{uid}/onboarding/current — server-only. Holds the wizard state and the
 * server-reserved businessId that makes creation idempotent.
 */
export interface OnboardingDraft extends Stamped {
  status: Exclude<OnboardingStatus, "NOT_STARTED">;
  /** Reserved at draft creation; the business is created under exactly this id. */
  businessId: string;
  step: number;
  data: Record<string, unknown>;
  logo: DraftLogo | null;
  completedBusinessId: string | null;
}

/** A user’s membership in one business, joined with the business summary. */
export interface Membership {
  businessId: string;
  role: Role;
  business: Pick<Business, "id" | "name" | "slug" | "storeStatus" | "industry">;
}

/** businesses/{businessId}/members/{uid} — document id IS the user's uid. */
export interface Member extends Stamped {
  uid: string;
  businessId: string;
  role: Role;
  email: string;
  fullName: string;
  invitedBy: string | null;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/** businesses/{businessId}/invitations/{invitationId} */
export interface Invitation extends Stamped {
  id: string;
  businessId: string;
  email: string;
  role: Exclude<Role, "OWNER">;
  status: InvitationStatus;
  invitedBy: string;
  expiresAt: string;
  acceptedBy: string | null;
}

/** businesses/{businessId}/categories/{categoryId} */
export interface Category extends Stamped {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  description: string;
  image: MediaRef | null;
  active: boolean;
  sortOrder: number;
  /** Maintained transactionally by product writes; powers safe deletion. */
  productCount: number;
  /** Lowercased name; enables prefix search without a search service. */
  searchName: string;
}

export type ProductStatus = "draft" | "active" | "archived";
export type ProductAvailability = "in_stock" | "out_of_stock";

export interface MediaRef {
  mediaId: string;
  url: string;
  storagePath: string;
  alt: string;
}

/** businesses/{businessId}/products/{productId} */
export interface Product extends Stamped {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  categoryId: string | null;
  /** Ordered; index 0 is the primary image. Capped (see PRODUCT_MAX_IMAGES). */
  images: MediaRef[];
  /** Minor units (cents) — never floats. */
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  sku: string;
  stockQuantity: number | null;
  status: ProductStatus;
  availability: ProductAvailability;
  featured: boolean;
  sortOrder: number;
  seoTitle: string;
  seoDescription: string;
  /** Lowercased name; enables prefix search without a search service. */
  searchName: string;
}

/** businesses/{businessId}/settings/branding */
export interface BrandingSettings extends Stamped {
  displayName: string;
  defaultTheme: "light" | "dark";
  logo: MediaRef | null;
  favicon: MediaRef | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  brandDescription: string;
  contactEmail: string;
  contactPhone: string;
  social: { instagram: string; facebook: string; x: string; tiktok: string; website: string };
}

/** businesses/{businessId}/settings/store */
export interface StoreSettings extends Stamped {
  displayName: string;
  description: string;
  currency: string;
  status: StoreStatus;
  publicVisibility: boolean;
}

/** businesses/{businessId}/media/{mediaId} */
export interface MediaAsset extends Stamped {
  id: string;
  /** What the asset is attached to; null while uploaded but unattached. */
  ownerType: "product" | "category" | "branding" | null;
  ownerId: string | null;
  businessId: string;
  storagePath: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  fileName: string;
  uploadedBy: string;
  deletedAt: string | null;
}

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
}

/** Result envelope returned by every server action. */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

