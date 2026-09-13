import { z } from "zod";

import { idSchema } from "./primitives";

export const METAFIELD_OWNER_TYPES = [
  "product",
  "variant",
  "collection",
  "company",
  "order",
  "customer",
] as const;
export const metafieldOwnerTypeSchema = z.enum(METAFIELD_OWNER_TYPES);
export type MetafieldOwnerType = z.infer<typeof metafieldOwnerTypeSchema>;

export const METAFIELD_TYPES = [
  "single_line_text",
  "multi_line_text",
  "integer",
  "decimal",
  "boolean",
  "date",
  "json",
  "url",
  "product_reference",
  "collection_reference",
  "file_reference",
] as const;
export const metafieldTypeSchema = z.enum(METAFIELD_TYPES);
export type MetafieldType = z.infer<typeof metafieldTypeSchema>;

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores");

export const metafieldValidationsSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  regex: z.string().max(200).optional(),
  choices: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
});
export type MetafieldValidations = z.infer<typeof metafieldValidationsSchema>;

export const metafieldDefinitionInputSchema = z.object({
  ownerType: metafieldOwnerTypeSchema,
  namespace: identifier,
  key: identifier,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  type: metafieldTypeSchema,
  validations: metafieldValidationsSchema.default({}),
});
export type MetafieldDefinitionInput = z.infer<typeof metafieldDefinitionInputSchema>;

export const updateMetafieldDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  validations: metafieldValidationsSchema.optional(),
});
export type UpdateMetafieldDefinitionInput = z.infer<typeof updateMetafieldDefinitionSchema>;

export const metafieldValueInputSchema = z.object({
  namespace: identifier,
  key: identifier,
  // null clears the metafield
  value: z.unknown(),
});
export const setMetafieldsSchema = z.object({
  metafields: z.array(metafieldValueInputSchema).max(100),
});
export type SetMetafieldsInput = z.infer<typeof setMetafieldsSchema>;

export const metafieldOwnerSchema = z.object({
  ownerType: metafieldOwnerTypeSchema,
  ownerId: idSchema,
});

export interface MetafieldDefinitionSummary {
  id: string;
  ownerType: MetafieldOwnerType;
  namespace: string;
  key: string;
  name: string;
  description: string | null;
  type: MetafieldType;
  validations: MetafieldValidations;
  createdAt: string;
}

export interface MetafieldValue {
  id: string;
  namespace: string;
  key: string;
  type: MetafieldType;
  value: unknown;
  definitionId: string | null;
  updatedAt: string;
}
