import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  marketInputSchema,
  updateMarketSchema,
  type MarketInput,
  type UpdateMarketInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { MarketsService } from "./markets.service";

@Controller("stores/:storeId/markets")
export class MarketsController {
  constructor(private readonly markets: MarketsService) {}

  @Get()
  @RequireStore("settings.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.markets.list(tenant);
  }
  
  @Get(":marketId")
  @RequireStore("settings.read")
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param("marketId") id: string,
  ) {
    return this.markets.get(tenant, id);
  }

  @Post()
  @RequireStore("settings.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(marketInputSchema)) body: MarketInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.markets.create(tenant, body, meta);
  }

  @Patch(":marketId")
  @RequireStore("settings.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("marketId") id: string,
    @Body(new ZodValidationPipe(updateMarketSchema)) body: UpdateMarketInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.markets.update(tenant, id, body, meta);
  }

  @Delete(":marketId")
  @RequireStore("settings.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("marketId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.markets.remove(tenant, id, meta);
  }
}
