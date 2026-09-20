import { Module } from "@nestjs/common";

import { RateLimitGuard } from "../../common/rate-limit/rate-limit.guard";
import { PlatformRoleGuard } from "../../common/auth/platform-role.guard";
import { PlatformSessionGuard } from "../../common/auth/platform-session.guard";
import { BillingModule } from "../billing/billing.module";
import { UsersModule } from "../users/users.module";
import { PlatformAuditController } from "./platform-audit.controller";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformAuthController } from "./platform-auth.controller";
import { PlatformAuthService } from "./platform-auth.service";
import {
  PlatformBillingController,
  PlatformPlansController,
} from "./platform-billing.controller";
import { PlatformCountriesController } from "./platform-countries.controller";
import { PlatformCountriesService } from "./platform-countries.service";
import { PlatformDomainsController } from "./platform-domains.controller";
import { PlatformDomainsService } from "./platform-domains.service";
import { PlatformFeatureFlagsController } from "./platform-feature-flags.controller";
import { PlatformFeatureFlagsService } from "./platform-feature-flags.service";
import { PlatformMetricsController } from "./platform-metrics.controller";
import { PlatformMetricsService } from "./platform-metrics.service";
import {
  PlatformOrganizationsController,
  PlatformStoresController,
} from "./platform-organizations.controller";
import { PlatformOrganizationsService } from "./platform-organizations.service";

// The entire cross-tenant, no-tenant-scoping surface for apps/platform-admin lives in this one
// module. It is intentionally the only place in apps/api allowed to query Organization/Store/
// Subscription/etc. without going through TenantService — every controller here is gated by
// PlatformSessionGuard (a platform operator's own session realm, see
// common/auth/platform-session.guard.ts), never by the merchant SessionGuard/PermissionGuard
// pair every other module relies on. Do not import PlatformOrganizationsService (etc.) into a
// merchant-facing module — cross-tenant reads must only ever be reachable through a
// platform-operator-gated route.
@Module({
  imports: [UsersModule, BillingModule],
  controllers: [
    PlatformAuthController,
    PlatformOrganizationsController,
    PlatformStoresController,
    PlatformBillingController,
    PlatformPlansController,
    PlatformDomainsController,
    PlatformAuditController,
    PlatformFeatureFlagsController,
    PlatformMetricsController,
    PlatformCountriesController,
  ],
  providers: [
    PlatformSessionGuard,
    PlatformRoleGuard,
    RateLimitGuard,
    PlatformAuthService,
    PlatformOrganizationsService,
    PlatformDomainsService,
    PlatformAuditService,
    PlatformFeatureFlagsService,
    PlatformMetricsService,
    PlatformCountriesService,
  ],
})
export class PlatformModule {}
