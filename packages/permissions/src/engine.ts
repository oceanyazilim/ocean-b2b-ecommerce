import type { Permission } from "./permissions";

// A resolved set of permissions for one principal inside one scope
// (organization, store, or company). Resolution from DB roles happens in the API;
// this engine only answers "does this set satisfy this requirement".

export type PermissionSet = ReadonlySet<Permission>;

export type PermissionRequirement =
  | Permission
  | { allOf: readonly PermissionRequirement[] }
  | { anyOf: readonly PermissionRequirement[] };

export function createPermissionSet(permissions: Iterable<Permission>): PermissionSet {
  return new Set(permissions);
}

export function satisfies(granted: PermissionSet, requirement: PermissionRequirement): boolean {
  if (typeof requirement === "string") {
    return granted.has(requirement);
  }
  if ("allOf" in requirement) {
    return requirement.allOf.every((r) => satisfies(granted, r));
  }
  return requirement.anyOf.some((r) => satisfies(granted, r));
}

export function missing(granted: PermissionSet, requirement: PermissionRequirement): Permission[] {
  if (typeof requirement === "string") {
    return granted.has(requirement) ? [] : [requirement];
  }
  if ("allOf" in requirement) {
    return requirement.allOf.flatMap((r) => missing(granted, r));
  }
  if (requirement.anyOf.some((r) => satisfies(granted, r))) {
    return [];
  }
  return requirement.anyOf.flatMap((r) => missing(granted, r));
}
