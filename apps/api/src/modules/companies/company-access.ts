import {
  COMPANY_ROLE_PERMISSIONS,
  createPermissionSet,
  satisfies,
  type CompanyPermission,
  type CompanyRole,
  type PermissionSet,
} from "@ocean/permissions";

// Pure helpers the storefront/customer realm (Phase 8) and checkout (Phase 6) use to answer
// "may this company user do X at location Y". No I/O: callers load the membership first.

export interface CompanyMembershipFacts {
  status: "active" | "disabled";
  role: CompanyRole;
  allLocations: boolean;
  locationIds: readonly string[];
  companyStatus: "active" | "suspended" | "archived";
  customerStatus: "active" | "disabled";
}

export function companyPermissionsFor(membership: CompanyMembershipFacts): PermissionSet {
  if (!isMembershipUsable(membership)) return createPermissionSet([]);
  return createPermissionSet(COMPANY_ROLE_PERMISSIONS[membership.role]);
}

// A suspended company or a disabled customer/membership grants nothing, even to admins.
export function isMembershipUsable(membership: CompanyMembershipFacts): boolean {
  return (
    membership.status === "active" &&
    membership.companyStatus === "active" &&
    membership.customerStatus === "active"
  );
}

export function canActAtLocation(
  membership: CompanyMembershipFacts,
  locationId: string,
  permission: CompanyPermission,
): boolean {
  if (!satisfies(companyPermissionsFor(membership), permission)) return false;
  return membership.allLocations || membership.locationIds.includes(locationId);
}

export function accessibleLocationIds(
  membership: CompanyMembershipFacts,
  companyLocationIds: readonly string[],
): string[] {
  if (!isMembershipUsable(membership)) return [];
  if (membership.allLocations) return [...companyLocationIds];
  const allowed = new Set(membership.locationIds);
  return companyLocationIds.filter((id) => allowed.has(id));
}
