import { z } from "zod";
import { isValidSlug } from "@/lib/utils/slug";

export const INDUSTRIES = [
  "Apparel & Fashion",
  "Beauty & Personal Care",
  "Food & Beverage",
  "Home & Living",
  "Electronics",
  "Health & Wellness",
  "Jewelry & Accessories",
  "Sports & Outdoors",
  "Art & Crafts",
  "Books & Stationery",
  "Toys & Kids",
  "Other",
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (label: string) => z.string().regex(HEX, `${label} must be a hex color like #1A2B3C`);

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address");

const optionalPhone = z
  .string()
  .trim()
  .max(24)
  .refine((v) => v === "" || /^\+?[0-9][0-9 ()\-.]{5,22}$/.test(v), "Enter a valid phone number");

const text = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).refine((v) => !/[<>]/.test(v), "Contains invalid characters");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => isValidSlug(v), "Use 2–48 lowercase letters, numbers and single hyphens (not a reserved word)");

/** Field rules with NO defaults — the single source for both the full and the draft schema. */
const baseShape = z.object({
  // Step 1 — business
  businessName: text(80).pipe(z.string().min(2, "Enter your business name")),
  industry: z.enum(INDUSTRIES, { error: "Choose an industry" }),
  description: text(500),
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  // Step 2 — store identity
  storeDisplayName: text(80).pipe(z.string().min(2, "Enter a store name")),
  /** Empty = let the server derive one from the store name (with collision handling). */
  slug: z.union([slugSchema, z.literal("")]),
  storeDescription: text(500),
  storeStatus: z.enum(["unpublished", "published"]),
  // Step 3 — branding
  primaryColor: color("Primary color"),
  secondaryColor: color("Secondary color"),
  accentColor: color("Accent color"),
  defaultTheme: z.enum(["light", "dark"]),
});

/** Full payload required to create the business. Optional fields get their defaults here. */
export const onboardingSchema = baseShape.extend({
  description: baseShape.shape.description.default(""),
  contactEmail: baseShape.shape.contactEmail.default(""),
  contactPhone: baseShape.shape.contactPhone.default(""),
  slug: baseShape.shape.slug.default(""),
  storeDescription: baseShape.shape.storeDescription.default(""),
  storeStatus: baseShape.shape.storeStatus.default("unpublished"),
  primaryColor: baseShape.shape.primaryColor.default("#111827"),
  secondaryColor: baseShape.shape.secondaryColor.default("#6B7280"),
  accentColor: baseShape.shape.accentColor.default("#2563EB"),
  defaultTheme: baseShape.shape.defaultTheme.default("light"),
});
export type OnboardingInput = z.output<typeof onboardingSchema>;

/**
 * Draft payload: every field optional (users may be mid-way) and WITHOUT defaults,
 * so saving one field never overwrites the others. Anything present must satisfy the
 * same constraints. Unknown keys are stripped.
 */
export const draftDataSchema = baseShape.partial();
export type DraftData = z.output<typeof draftDataSchema>;

export const draftSaveSchema = z.object({
  step: z.number().int().min(1).max(4),
  data: draftDataSchema,
  /** Start a brand-new draft (second business) instead of resuming. Rejected while an unfinished draft exists. */
  fresh: z.boolean().optional(),
  /** Discard the uploaded logo. */
  removeLogo: z.boolean().optional(),
});

export const slugCheckSchema = z.object({ slug: z.string().trim().toLowerCase().max(80) });

/** Logo rules shared by the upload route and tests. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
