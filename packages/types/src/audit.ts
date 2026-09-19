import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";

export interface AuditLogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorType: string;
  actor: { id: string; name: string; email: string } | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

export const auditLogQuerySchema = cursorPaginationQuerySchema.extend({
  resourceType: z.string().trim().min(1).max(60).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
