import { Controller, Get, Param } from "@nestjs/common";

import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { LegalService } from "./legal.service";

@Controller("stores/:storeId/legal")
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get("status")
  @RequireStore("content.read")
  getStatus(@CurrentTenant() tenant: TenantContext) {
    return this.legal.getStatusForStore(tenant);
  }
}

// Platform-wide catalog read (no tenant scoping needed — same convention as
// GET /countries/:countryCode): lets any signed-in surface look up what a country conventionally
// requires without going through a specific store.
@Controller("legal/requirements")
export class LegalRequirementsController {
  constructor(private readonly legal: LegalService) {}

  @Get(":countryCode")
  list(@Param("countryCode") countryCode: string) {
    return this.legal.listRequirementsForCountry(countryCode);
  }
}
