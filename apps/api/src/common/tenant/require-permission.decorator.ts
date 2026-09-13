import { SetMetadata } from "@nestjs/common";
import type { PermissionRequirement } from "@ocean/permissions";

export const PERMISSION_KEY = "ocean:permission";

export type TenantScope = "store" | "organization";

export interface PermissionMetadata {
  scope: TenantScope;
  requirement: PermissionRequirement | null;
  param: string;
}

// Resolves the tenant from a route param and enforces a permission on it.
// `RequireStore("users.manage")` → param `storeId`; `RequireOrganization("stores.create")` → `organizationId`.
export const RequireStore = (requirement: PermissionRequirement | null = null, param = "storeId") =>
  SetMetadata<string, PermissionMetadata>(PERMISSION_KEY, { scope: "store", requirement, param });

export const RequireOrganization = (
  requirement: PermissionRequirement | null = null,
  param = "organizationId",
) =>
  SetMetadata<string, PermissionMetadata>(PERMISSION_KEY, {
    scope: "organization",
    requirement,
    param,
  });
