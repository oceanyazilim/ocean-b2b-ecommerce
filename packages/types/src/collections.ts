import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";
import { idSchema, slugSchema } from "./primitives";

export const COLLECTION_RULE_FIELDS = [
  "title",
  "product_type",
  "vendor",
  "tag",
  "price",
  "category",
  "status",
] as const;
export const collectionRuleFieldSchema = z.enum(COLLECTION_RULE_FIELDS);
export type CollectionRuleField = z.infer<typeof collectionRuleFieldSchema>;

export const COLLECTION_RULE_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;
export const collectionRuleOperatorSchema = z.enum(COLLECTION_RULE_OPERATORS);
export type CollectionRuleOperator = z.infer<typeof collectionRuleOperatorSchema>;

export const collectionRuleSchema = z.object({
  field: collectionRuleFieldSchema,
  operator: collectionRuleOperatorSchema,
  value: z.string().trim().min(1, "Value is required").max(120),
});
export type CollectionRule = z.infer<typeof collectionRuleSchema>;

export const COLLECTION_TYPES = ["manual", "automated"] as const;
export const collectionTypeSchema = z.enum(COLLECTION_TYPES);

export const COLLECTION_SORT_ORDERS = [
  "manual",
  "title_asc",
  "title_desc",
  "created_desc",
  "price_asc",
  "price_desc",
] as const;
export const collectionSortOrderSchema = z.enum(COLLECTION_SORT_ORDERS);

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const collectionInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(255),
    handle: slugSchema.optional(),
    descriptionHtml: z.string().max(50_000).default(""),
    type: collectionTypeSchema,
    rules: z.array(collectionRuleSchema).max(20).default([]),
    rulesMatchAll: z.boolean().default(true),
    sortOrder: collectionSortOrderSchema.default("manual"),
    imageMediaId: idSchema.nullable().optional(),
    seoTitle: optionalText(70),
    seoDescription: optionalText(320),
    published: z.boolean().default(true),
  })
  .refine((v) => v.type !== "automated" || v.rules.length > 0, {
    message: "Automated collections need at least one rule",
    path: ["rules"],
  });
export type CollectionInput = z.infer<typeof collectionInputSchema>;

export const createCollectionSchema = collectionInputSchema;
export const updateCollectionSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  handle: slugSchema.optional(),
  descriptionHtml: z.string().max(50_000).optional(),
  rules: z.array(collectionRuleSchema).max(20).optional(),
  rulesMatchAll: z.boolean().optional(),
  sortOrder: collectionSortOrderSchema.optional(),
  imageMediaId: idSchema.nullable().optional(),
  seoTitle: optionalText(70),
  seoDescription: optionalText(320),
  published: z.boolean().optional(),
  version: z.number().int().positive(),
});
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

export const collectionListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  type: collectionTypeSchema.optional(),
});
export type CollectionListQuery = z.infer<typeof collectionListQuerySchema>;

export const collectionProductsMutationSchema = z.object({
  productIds: z.array(idSchema).min(1).max(250),
});
export const collectionProductsOrderSchema = z.object({ order: z.array(idSchema).max(500) });

export const collectionPreviewSchema = z.object({
  rules: z.array(collectionRuleSchema).min(1).max(20),
  rulesMatchAll: z.boolean().default(true),
});

export interface CollectionSummary {
  id: string;
  title: string;
  handle: string;
  type: "manual" | "automated";
  productCount: number;
  published: boolean;
  image: { url: string; alt: string | null } | null;
  version: number;
  updatedAt: string;
}

export interface CollectionDetail extends CollectionSummary {
  descriptionHtml: string;
  rules: CollectionRule[];
  rulesMatchAll: boolean;
  sortOrder: string;
  imageMediaId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}
