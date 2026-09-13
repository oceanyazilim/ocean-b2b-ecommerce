import type { PermissionSet } from "./engine";
import { createPermissionSet } from "./engine";
import type { OrganizationPermission, StorePermission } from "./permissions";
import type { OrganizationRole, StoreRole } from "./roles";
import { ORGANIZATION_ROLE_PERMISSIONS, STORE_ROLE_PERMISSIONS } from "./roles";

// Organization owners/admins administer every store in the organization even without an
// explicit store membership; other org roles get nothing at store level on their own.
const ORG_ROLES_IMPLYING_STORE_OWNER: ReadonlySet<OrganizationRole> = new Set(["owner", "admin"]);

export function resolveStorePermissions(
  organizationRole: OrganizationRole | null,
  storeRole: StoreRole | null,
): PermissionSet {
  const granted = new Set<StorePermission>();
  if (organizationRole && ORG_ROLES_IMPLYING_STORE_OWNER.has(organizationRole)) {
    for (const p of STORE_ROLE_PERMISSIONS.store_owner) granted.add(p);
  }
  if (storeRole) {
    for (const p of STORE_ROLE_PERMISSIONS[storeRole]) granted.add(p);
  }
  return createPermissionSet(granted);
}

export function resolveOrganizationPermissions(
  organizationRole: OrganizationRole | null,
): PermissionSet {
  const granted = new Set<OrganizationPermission>();
  if (organizationRole) {
    for (const p of ORGANIZATION_ROLE_PERMISSIONS[organizationRole]) granted.add(p);
  }
  return createPermissionSet(granted);
}
