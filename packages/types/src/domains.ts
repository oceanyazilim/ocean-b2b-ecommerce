import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";

export const domainInputSchema = z.object({
  hostname: z.string().trim().min(1).max(255),
  type: z.enum(["default", "custom"]).default("custom"),
  isPrimary: z.boolean().default(false),
});
export type DomainInput = z.infer<typeof domainInputSchema>;

export const updateDomainSchema = domainInputSchema.partial();
export type UpdateDomainInput = z.infer<typeof updateDomainSchema>;

export const domainListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});
export type DomainListQuery = z.infer<typeof domainListQuerySchema>;

export interface DomainSummary {
  id: string;
  hostname: string;
  type: "default" | "custom";
  status: "pending" | "verified" | "failed";
  verifiedAt: string | null;
  sslStatus: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}
