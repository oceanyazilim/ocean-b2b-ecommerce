import { z } from "zod";

import { idSchema, slugSchema } from "./primitives";

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  handle: slugSchema.optional(),
  parentId: idSchema.nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const updateCategorySchema = categoryInputSchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export interface CategoryNode {
  id: string;
  name: string;
  handle: string;
  path: string;
  parentId: string | null;
  position: number;
  productCount: number;
  children: CategoryNode[];
}
