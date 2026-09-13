import { Body, Controller, Get, Patch } from "@nestjs/common";
import {
  updateOnboardingSchema,
  updateStoreSchema,
  type UpdateOnboardingInput,
  type UpdateStoreInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { StoresService } from "./stores.service";

@Controller("stores/:storeId")
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  @RequireStore("settings.read")
  get(@CurrentTenant() tenant: TenantContext) {
    return this.stores.get(tenant);
  }

  @Patch()
  @RequireStore("settings.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateStoreSchema)) body: UpdateStoreInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.stores.update(tenant, body, meta);
  }

  @Patch("onboarding")
  @RequireStore("settings.write")
  updateOnboarding(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateOnboardingSchema)) body: UpdateOnboardingInput,
  ) {
    return this.stores.updateOnboarding(tenant, body);
  }
}
