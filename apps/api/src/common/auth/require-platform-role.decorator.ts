import { SetMetadata } from "@nestjs/common";
import type { PlatformOperatorRole } from "@ocean/db";

export const PLATFORM_ROLE_KEY = "ocean:platform-role";

// Ordered low-to-high, same shape as PlatformOperatorRole in schema.prisma: a viewer can read
// every platform/* route, an operator can also use the mutating ones, admin is reserved for
// anything added later that should stay narrower still than "operator".
export const PLATFORM_ROLE_RANK: Record<PlatformOperatorRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

// Marks a platform/* route handler as requiring at least this role. Read alongside
// PlatformRoleGuard, which must run after PlatformSessionGuard (it trusts req.platformSession to
// already be set).
export const RequirePlatformRole = (role: PlatformOperatorRole) =>
  SetMetadata<string, PlatformOperatorRole>(PLATFORM_ROLE_KEY, role);
