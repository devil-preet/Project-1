import type { ProductAvailability, ProductStatus } from "@/types";

/** What the business workspace sees (admin image URLs, all statuses). */
export interface ImageDTO {
  mediaId: string;
  url: string;
  alt: string;
}

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: ImageDTO | null;
  active: boolean;
  sortOrder: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDTO {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  categoryName: string;
  shortDescription: string;
  description: string;
  images: ImageDTO[];
  primaryImage: ImageDTO | null;
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
  createdAt: string;
  updatedAt: string;
}
