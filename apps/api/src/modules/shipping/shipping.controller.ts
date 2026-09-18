import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  shippingRateInputSchema,
  shippingZoneInputSchema,
  updateShippingRateSchema,
  updateShippingZoneSchema,
  type ShippingRateInput,
  type ShippingZoneInput,
  type UpdateShippingRateInput,
  type UpdateShippingZoneInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ShippingService } from "./shipping.service";

@Controller("stores/:storeId/shipping/zones")
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get()
  @RequireStore("shipping.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.shipping.listZones(tenant);
  }

  @Get(":zoneId")
  @RequireStore("shipping.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("zoneId") id: string) {
    return this.shipping.getZone(tenant, id);
  }

  @Post()
  @RequireStore("shipping.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(shippingZoneInputSchema)) body: ShippingZoneInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.shipping.createZone(tenant, body, meta);
  }

  @Patch(":zoneId")
  @RequireStore("shipping.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("zoneId") id: string,
    @Body(new ZodValidationPipe(updateShippingZoneSchema)) body: UpdateShippingZoneInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.shipping.updateZone(tenant, id, body, meta);
  }

  @Delete(":zoneId")
  @RequireStore("shipping.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("zoneId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.shipping.removeZone(tenant, id, meta);
  }

  @Post(":zoneId/rates")
  @RequireStore("shipping.write")
  createRate(
    @CurrentTenant() tenant: TenantContext,
    @Param("zoneId") zoneId: string,
    @Body(new ZodValidationPipe(shippingRateInputSchema)) body: ShippingRateInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.shipping.createRate(tenant, zoneId, body, meta);
  }

  @Patch(":zoneId/rates/:rateId")
  @RequireStore("shipping.write")
  updateRate(
    @CurrentTenant() tenant: TenantContext,
    @Param("zoneId") zoneId: string,
    @Param("rateId") rateId: string,
    @Body(new ZodValidationPipe(updateShippingRateSchema)) body: UpdateShippingRateInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.shipping.updateRate(tenant, zoneId, rateId, body, meta);
  }

  @Delete(":zoneId/rates/:rateId")
  @RequireStore("shipping.write")
  @HttpCode(204)
  async removeRate(
    @CurrentTenant() tenant: TenantContext,
    @Param("zoneId") zoneId: string,
    @Param("rateId") rateId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.shipping.removeRate(tenant, zoneId, rateId, meta);
  }
}
