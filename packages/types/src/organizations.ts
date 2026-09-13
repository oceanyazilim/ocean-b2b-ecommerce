import { z } from "zod";

import { slugSchema } from "./primitives";

export const organizationNameSchema = z.string().trim().min(2).max(120);

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  slug: slugSchema.optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: organizationNameSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
}
