import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";
import { idSchema, moneyMinorSchema, slugSchema, type Money } from "./primitives";

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const WEIGHT_UNITS = ["g", "kg", "lb", "oz"] as const;
export const weightUnitSchema = z.enum(WEIGHT_UNITS);

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 250;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const productOptionInputSchema = z.object({
  name: z.string().trim().min(1, "Option name is required").max(60),
  values: z
    .array(z.string().trim().min(1, "Option value is required").max(80))
    .min(1, "Add at least one value")
    .max(100),
});
export type ProductOptionInput = z.infer<typeof productOptionInputSchema>;

export const variantInputSchema = z.object({
  id: idSchema.optional(),
  optionValues: z.array(z.string().trim().min(1)).max(MAX_OPTIONS).default([]),
  sku: optionalText(64),
  barcode: optionalText(64),
  price: moneyMinorSchema.min(0, "Price cannot be negative"),
  compareAtPrice: moneyMinorSchema.min(0).nullable().optional(),
  cost: moneyMinorSchema.min(0).nullable().optional(),
  weight: z.number().nonnegative().nullable().optional(),
  weightUnit: weightUnitSchema.default("kg"),
  taxable: z.boolean().default(true),
  requiresShipping: z.boolean().default(true),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(50);
const optionsSchema = z.array(productOptionInputSchema).max(MAX_OPTIONS);

// Default-free shape shared by create and update. Zod 4 applies `.default()` inside
// `.partial()`, so defaults live only on the create schema or a PATCH would reset fields.
const productFields = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  handle: slugSchema.optional(),
  descriptionHtml: z.string().max(100_000),
  vendor: optionalText(120),
  productType: optionalText(120),
  categoryId: idSchema.nullable().optional(),
  status: productStatusSchema,
  tags: tagsSchema,
  seoTitle: optionalText(70),
  seoDescription: optionalText(320),
  templateSuffix: optionalText(60),
  options: optionsSchema,
  variants: z
    .array(variantInputSchema)
    .min(1, "A product needs at least one variant")
    .max(MAX_VARIANTS),
  mediaIds: z.array(idSchema).max(50).optional(),
});

export const productInputSchema = productFields.extend({
  descriptionHtml: z.string().max(100_000).default(""),
  status: productStatusSchema.default("draft"),
  tags: tagsSchema.default([]),
  options: optionsSchema.default([]),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const createProductSchema = productInputSchema;
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = productFields
  .partial()
  .extend({ version: z.number().int().positive() });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const PRODUCT_SORTS = [
  "created_desc",
  "created_asc",
  "updated_desc",
  "title_asc",
  "title_desc",
] as const;
export const productListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: productStatusSchema.optional(),
  sort: z.enum(PRODUCT_SORTS).default("created_desc"),
  collectionId: idSchema.optional(),
  tag: z.string().trim().max(40).optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productStatusUpdateSchema = z.object({ status: productStatusSchema });

export const PRODUCT_BULK_ACTIONS = [
  "archive",
  "unarchive",
  "delete",
  "add_tag",
  "remove_tag",
] as const;
export const productBulkActionSchema = z
  .object({
    ids: z.array(idSchema).min(1).max(100),
    action: z.enum(PRODUCT_BULK_ACTIONS),
    tag: z.string().trim().min(1).max(40).optional(),
  })
  .refine((v) => !v.action.endsWith("_tag") || !!v.tag, {
    message: "Tag is required for tag actions",
    path: ["tag"],
  });
export type ProductBulkAction = z.infer<typeof productBulkActionSchema>;

export const attachMediaSchema = z.object({ mediaId: idSchema });
export const productMediaOrderSchema = z.object({ order: z.array(idSchema).max(50) });

export interface ProductOptionSummary {
  id: string;
  name: string;
  position: number;
  values: { id: string; value: string; position: number }[];
}

export interface ProductVariantSummary {
  id: string;
  title: string;
  optionValues: string[];
  sku: string | null;
  barcode: string | null;
  price: Money;
  compareAtPrice: Money | null;
  cost: Money | null;
  weight: number | null;
  weightUnit: string;
  taxable: boolean;
  requiresShipping: boolean;
  position: number;
}

export interface ProductMediaSummary {
  id: string;
  kind: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  position: number;
}

export interface ProductSummary {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  variantCount: number;
  priceRange: { min: Money; max: Money } | null;
  image: { url: string; alt: string | null } | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail extends ProductSummary {
  descriptionHtml: string;
  categoryId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  templateSuffix: string | null;
  publishedAt: string | null;
  options: ProductOptionSummary[];
  variants: ProductVariantSummary[];
  media: ProductMediaSummary[];
}
