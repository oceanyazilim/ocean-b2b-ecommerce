// Types for the platform-operator surface (apps/platform-admin + apps/api's platform/* module).
// Deliberately its own file, separate from every merchant-facing type above: nothing here is
// tenant-scoped, and these shapes should never be imported by merchant-admin code paths.
import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";
import { emailSchema } from "./primitives";
import type { SubscriptionDetail } from "./billing";

// ---- Auth -------------------------------------------------------------------------------------

export const platformLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

export interface PlatformOperatorSummary {
  id: string;
  email: string;
  name: string;
  status: "active" | "suspended";
  createdAt: string;
}

export interface PlatformMeResponse {
  operator: PlatformOperatorSummary;
}

// ---- Organizations & stores ---------------------------------------------------------------

export const platformOrganizationListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});
export type PlatformOrganizationListQuery = z.infer<typeof platformOrganizationListQuerySchema>;

export interface PlatformOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  createdAt: string;
  storeCount: number;
  staffCount: number;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: SubscriptionDetail["status"] | null;
}

export interface PlatformStoreSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  organizationId: string;
  organizationName: string;
  defaultCurrency: string;
  defaultLocale: string;
  staffCount: number;
  domainCount: number;
  createdAt: string;
}

export interface PlatformOrganizationDetail extends PlatformOrganizationSummary {
  stores: PlatformStoreSummary[];
  subscription: SubscriptionDetail | null;
}

export const platformStoreListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  organizationId: z.string().uuid().optional(),
});
export type PlatformStoreListQuery = z.infer<typeof platformStoreListQuerySchema>;

// ---- Domains --------------------------------------------------------------------------------

export const platformDomainListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["pending", "verified", "failed"]).optional(),
});
export type PlatformDomainListQuery = z.infer<typeof platformDomainListQuerySchema>;

export interface PlatformDomainSummary {
  id: string;
  hostname: string;
  type: "default" | "custom";
  status: "pending" | "verified" | "failed";
  verifiedAt: string | null;
  sslStatus: string;
  isPrimary: boolean;
  createdAt: string;
  storeId: string;
  storeName: string;
  organizationId: string;
  organizationName: string;
}

// ---- Audit log --------------------------------------------------------------------------------

export const platformAuditLogQuerySchema = cursorPaginationQuerySchema.extend({
  resourceType: z.string().trim().min(1).max(60).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  organizationId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type PlatformAuditLogQuery = z.infer<typeof platformAuditLogQuerySchema>;

export interface PlatformAuditLogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorType: string;
  actor: { id: string; name: string; email: string } | null;
  organizationId: string | null;
  organizationName: string | null;
  storeId: string | null;
  storeName: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

// ---- Feature flags ----------------------------------------------------------------------------

export const createFeatureFlagInputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_.-]*$/, "Use lowercase letters, numbers, dots, dashes or underscores"),
  description: z.string().trim().max(500).optional(),
  defaultOn: z.boolean().default(false),
});
export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagInputSchema>;

export const updateFeatureFlagInputSchema = z.object({
  description: z.string().trim().max(500).optional(),
  defaultOn: z.boolean().optional(),
});
export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagInputSchema>;

export const setFeatureFlagTargetInputSchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
    enabled: z.boolean(),
  })
  .refine((v) => Boolean(v.organizationId) !== Boolean(v.storeId), {
    message: "Provide exactly one of organizationId or storeId",
  });
export type SetFeatureFlagTargetInput = z.infer<typeof setFeatureFlagTargetInputSchema>;

export interface PlatformFeatureFlagTarget {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  storeId: string | null;
  storeName: string | null;
  enabled: boolean;
  updatedAt: string;
}

export interface PlatformFeatureFlagSummary {
  id: string;
  key: string;
  description: string | null;
  defaultOn: boolean;
  createdAt: string;
  targets: PlatformFeatureFlagTarget[];
}

// ---- Metrics ------------------------------------------------------------------------------

export interface PlatformPlanBreakdown {
  planId: string;
  planCode: string;
  planName: string;
  count: number;
}

export interface PlatformMetrics {
  organizationCount: number;
  storeCount: number;
  activeSubscriptionCount: number;
  trialingSubscriptionCount: number;
  pastDueSubscriptionCount: number;
  canceledSubscriptionCount: number;
  subscriptionsByPlan: PlatformPlanBreakdown[];
  verifiedDomainCount: number;
  pendingDomainCount: number;
  failedDomainCount: number;
}
