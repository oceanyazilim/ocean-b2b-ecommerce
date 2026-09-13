import { z } from "zod";

import { emailSchema } from "./primitives";

export const STORE_ROLES = [
  "store_owner",
  "admin",
  "store_manager",
  "product_manager",
  "order_manager",
  "marketing",
  "finance",
  "developer",
  "viewer",
] as const;
export const storeRoleSchema = z.enum(STORE_ROLES);

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: storeRoleSchema,
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const updateMemberRoleSchema = z.object({
  role: storeRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export interface StoreMemberSummary {
  userId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  joinedAt: string;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: string;
  invitedBy: { id: string; name: string };
  expiresAt: string;
  createdAt: string;
}

export interface InvitationPreview {
  storeName: string;
  organizationName: string;
  role: string;
  email: string;
  expiresAt: string;
}
