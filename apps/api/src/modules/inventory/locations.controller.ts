import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  locationInputSchema,
  updateLocationSchema,
  type LocationInput,
  type UpdateLocationInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { LocationsService } from "./locations.service";

@Controller("stores/:storeId/locations")
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @RequireStore("inventory.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.locations.list(tenant);
  }

  @Post()
  @RequireStore("inventory.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(locationInputSchema)) body: LocationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.create(tenant, body, meta);
  }

  @Get(":locationId")
  @RequireStore("inventory.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("locationId") id: string) {
    return this.locations.get(tenant, id);
  }

  @Patch(":locationId")
  @RequireStore("inventory.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("locationId") id: string,
    @Body(new ZodValidationPipe(updateLocationSchema)) body: UpdateLocationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.update(tenant, id, body, meta);
  }

  @Post(":locationId/default")
  @RequireStore("inventory.write")
  @HttpCode(200)
  setDefault(
    @CurrentTenant() tenant: TenantContext,
    @Param("locationId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.update(tenant, id, { isDefault: true, isActive: true }, meta);
  }

  @Delete(":locationId")
  @RequireStore("inventory.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("locationId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.locations.remove(tenant, id, meta);
  }
}
