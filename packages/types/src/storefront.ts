import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";
import { emailSchema, idSchema, type Money } from "./primitives";

// ---- customer auth --------------------------------------------------------------------------

export const customerSignupSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
  firstName: z.string().trim().max(80).nullable().optional(),
  lastName: z.string().trim().max(80).nullable().optional(),
});
export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;

export const customerLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;

export interface StorefrontCustomer {
  id: string;
  email: string;
  displayName: string;
  company: { id: string; displayName: string } | null;
}

// ---- catalog (buyer-priced, never exposes cost/margin) ---------------------------------------

export const storefrontProductListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  collectionHandle: z.string().trim().max(120).optional(),
  // L4 Global Localization: the customer's active storefront locale, if any — when a published
  // translation exists for it, product titles render translated; otherwise the default-language
  // content is used unchanged.
  locale: z.string().trim().max(35).optional(),
});
export type StorefrontProductListQuery = z.infer<typeof storefrontProductListQuerySchema>;

export interface StorefrontVariantSummary {
  id: string;
  title: string;
  optionValues: string[];
  sku: string | null;
  price: Money;
  compareAtPrice: Money | null;
  available: number | null;
  requiresShipping: boolean;
}

export interface StorefrontProductSummary {
  id: string;
  title: string;
  handle: string;
  image: { url: string; alt: string | null } | null;
  priceRange: { min: Money; max: Money } | null;
}

// Real full-text search (Meilisearch-backed — see apps/api SearchModule), distinct from the
// plain `q` substring filter on GET /products above. Typo-tolerant, ranked by relevance, and
// still catalog-access-filtered + buyer-priced like every other storefront product read.
export const storefrontSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});
export type StorefrontSearchQuery = z.infer<typeof storefrontSearchQuerySchema>;

export interface StorefrontSearchResult {
  query: string;
  products: StorefrontProductSummary[];
}

export interface StorefrontProductDetail extends StorefrontProductSummary {
  descriptionHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  options: { name: string; values: string[] }[];
  variants: StorefrontVariantSummary[];
  media: { id: string; kind: string; url: string; alt: string | null }[];
  // L4 Global Localization: true when title/descriptionHtml above came from a published
  // Translation row for the requested locale rather than the store's default-language content.
  isTranslated: boolean;
}

// ---- languages (L4 Global Localization, spec sections 2 & 9) ---------------------------------

export interface StorefrontLanguageSummary {
  locale: string;
  isDefault: boolean;
  // True when the language's script/direction is right-to-left (Arabic, Hebrew, Persian, ...) —
  // computed from the locale's language subtag, never a hardcoded per-locale list of languages.
  isRtl: boolean;
}

// Quick order (spec §25): a variant-level type-ahead by SKU/title/barcode, and an exact-SKU
// batch lookup for CSV bulk-add — both return buyer-priced variants, never the raw base price.
export const storefrontVariantSearchQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    skus: z.string().trim().max(4000).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((v) => !!v.q || !!v.skus, "Provide q or skus");
export type StorefrontVariantSearchQuery = z.infer<typeof storefrontVariantSearchQuerySchema>;

export interface StorefrontVariantSearchResult {
  variantId: string;
  productId: string;
  productTitle: string;
  productHandle: string;
  variantTitle: string;
  sku: string | null;
  image: { url: string; alt: string | null } | null;
  price: Money;
  compareAtPrice: Money | null;
  available: number | null;
}

export const storefrontCollectionListQuerySchema = cursorPaginationQuerySchema;
export type StorefrontCollectionListQuery = z.infer<typeof storefrontCollectionListQuerySchema>;

export interface StorefrontCollectionSummary {
  id: string;
  title: string;
  handle: string;
  image: { url: string; alt: string | null } | null;
}

export interface StorefrontCollectionDetail extends StorefrontCollectionSummary {
  descriptionHtml: string;
  products: StorefrontProductSummary[];
}

// ---- content pages ---------------------------------------------------------------------------

export interface StorefrontPageDetail {
  id: string;
  title: string;
  handle: string;
  bodyRich: { html?: string } | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

// ---- content blogs -----------------------------------------------------------------------

export interface StorefrontBlogSummary {
  id: string;
  title: string;
  handle: string;
}

export const storefrontArticleListQuerySchema = cursorPaginationQuerySchema;
export type StorefrontArticleListQuery = z.infer<typeof storefrontArticleListQuerySchema>;

export interface StorefrontArticleSummary {
  id: string;
  title: string;
  handle: string;
  excerpt: string | null;
  authorName: string | null;
  featuredImage: { url: string; alt: string | null } | null;
  tags: string[];
  publishedAt: string | null;
}

export interface StorefrontArticleDetail extends StorefrontArticleSummary {
  bodyRich: { html?: string } | null;
  seoTitle: string | null;
  seoDescription: string | null;
  blog: StorefrontBlogSummary;
}

export const createStorefrontCartSchema = z.object({
  items: z
    .array(z.object({ variantId: idSchema, quantity: z.number().int().min(1) }))
    .max(200)
    .default([]),
});
export type CreateStorefrontCartInput = z.infer<typeof createStorefrontCartSchema>;
