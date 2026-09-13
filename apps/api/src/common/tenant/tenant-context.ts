import type { PermissionSet } from "@ocean/permissions";
import type { OrganizationRole, StoreRole } from "@ocean/db";

export interface TenantActor {
  type: "user";
  id: string;
}

// Everything a repository needs to scope a query. Built once per request by TenantService
// and never constructed from request bodies.
export interface TenantContext {
  organizationId: string;
  storeId: string | null;
  actor: TenantActor;
  organizationRole: OrganizationRole | null;
  storeRole: StoreRole | null;
  organizationPermissions: PermissionSet;
  storePermissions: PermissionSet;
  requestId: string;
}
