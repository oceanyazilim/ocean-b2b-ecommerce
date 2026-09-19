import { z } from "zod";

export const createCustomRoleInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  permissions: z.array(z.string()).min(1).max(100),
});
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleInputSchema>;

export const updateCustomRoleInputSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  permissions: z.array(z.string()).min(1).max(100).optional(),
});
export type UpdateCustomRoleInput = z.infer<typeof updateCustomRoleInputSchema>;

export interface CustomRoleSummary {
  id: string;
  name: string;
  permissions: string[];
  memberCount: number;
  createdAt: string;
}
