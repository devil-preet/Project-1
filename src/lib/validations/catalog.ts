import { z } from "zod";
import { isValidSlug } from "@/lib/utils/slug";
import { MAX_PRICE_CENTS } from "@/lib/utils/money";

export const PRODUCT_MAX_IMAGES = 10;
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024; // stricter than the 10 MB rules ceiling: stays under the 10 MB proxy body buffer
export const MAX_CATEGORIES = 200;
export const PAGE_SIZE = 24;

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid id");
export const idSchema = ID;

const text = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).refine((v) => !/[<>]/.test(v), "Contains invalid characters");

/** Optional explicit slug; empty = derive from the name. */
const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || isValidSlug(v), "Use 2–48 lowercase letters, numbers and single hyphens");

export const categoryFields = z.object({
  name: text(80).pipe(z.string().min(2, "Enter a category name")),
  slug: slugField.default(""),
  description: text(500).default(""),
  active: z.boolean().default(true),
  /** Uploaded media id (from the media endpoint) or null for none. */
  imageId: ID.nullable().default(null),
});

export const categoryAction = z.discriminatedUnion("action", [
  categoryFields.extend({ action: z.literal("create") }),
  categoryFields.extend({ action: z.literal("update"), id: ID }),
  z.object({ action: z.literal("delete"), id: ID }),
  z.object({ action: z.literal("setActive"), id: ID, active: z.boolean() }),
  z.object({ action: z.literal("move"), id: ID, direction: z.enum(["up", "down"]) }),
]);
export type CategoryAction = z.output<typeof categoryAction>;

const cents = z.number().int("Price must be a whole number of minor units").min(0, "Price cannot be negative").max(MAX_PRICE_CENTS);

export const productFields = z
  .object({
    name: text(120).pipe(z.string().min(2, "Enter a product name")),
    slug: slugField.default(""),
    categoryId: ID,
    shortDescription: text(300).default(""),
    description: text(5000).pipe(z.string().min(1, "Enter a description")),
    priceCents: cents,
    compareAtPriceCents: cents.nullable().default(null),
    sku: text(64).default(""),
    stockQuantity: z.number().int().min(0).max(1_000_000).nullable().default(null),
    availability: z.enum(["in_stock", "out_of_stock"]).default("in_stock"),
    featured: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(100_000).default(0),
    seoTitle: text(70).default(""),
    seoDescription: text(160).default(""),
    /** Ordered media ids; index 0 is the cover image. */
    imageIds: z.array(ID).max(PRODUCT_MAX_IMAGES, `At most ${PRODUCT_MAX_IMAGES} images`).default([]),
    status: z.enum(["draft", "active", "archived"]).default("draft"),
  })
  .superRefine((p, ctx) => {
    if (p.compareAtPriceCents !== null && p.compareAtPriceCents <= p.priceCents) {
      ctx.addIssue({ code: "custom", path: ["compareAtPriceCents"], message: "Compare-at price must be higher than the price" });
    }
    if (new Set(p.imageIds).size !== p.imageIds.length) {
      ctx.addIssue({ code: "custom", path: ["imageIds"], message: "Duplicate image" });
    }
    if (p.status === "active" && p.imageIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["imageIds"], message: "Add at least one image before publishing" });
    }
  });

export const productAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), product: productFields }),
  z.object({ action: z.literal("update"), id: ID, product: productFields }),
  z.object({ action: z.literal("delete"), id: ID }),
  z.object({ action: z.literal("setStatus"), id: ID, status: z.enum(["draft", "active", "archived"]) }),
]);
export type ProductAction = z.output<typeof productAction>;
export type ProductInput = z.output<typeof productFields>;
export type CategoryInput = z.output<typeof categoryFields>;

export const settingsAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("store"),
    displayName: text(80).pipe(z.string().min(2, "Enter a store name")),
    description: text(500),
    currency: z.enum(["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"]),
  }),
  z.object({ action: z.literal("publish"), published: z.boolean() }),
  z.object({
    action: z.literal("branding"),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1A2B3C"),
    secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1A2B3C"),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1A2B3C"),
    defaultTheme: z.enum(["light", "dark"]),
    logoId: ID.nullable(),
  }),
]);
export type SettingsAction = z.output<typeof settingsAction>;

/** Query-string filters for the product list; invalid values fall back to defaults. */
export const productListQuery = z.object({
  q: z.string().max(60).optional().catch(undefined),
  status: z.enum(["draft", "active", "archived"]).optional().catch(undefined),
  categoryId: ID.optional().catch(undefined),
  order: z.enum(["created-desc", "created-asc", "name-asc", "name-desc", "price-asc", "price-desc"]).optional().catch(undefined),
  cursor: ID.optional().catch(undefined),
});
