import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  transferDecisionSchema,
  transferListQuerySchema,
  transferRequestInputSchema,
  type TransferDecisionInput,
  type TransferListQuery,
  type TransferRequestInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { TransfersService } from "./transfers.service";

@Controller("stores/:storeId/inventory/transfer-requests")
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @RequireStore("inventory.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(transferListQuerySchema)) query: TransferListQuery,
  ) {
    return this.transfers.list(tenant, query);
  }

  @Post()
  @RequireStore("inventory.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(transferRequestInputSchema)) body: TransferRequestInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.transfers.create(tenant, body, meta);
  }

  @Get(":transferId")
  @RequireStore("inventory.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("transferId") id: string) {
    return this.transfers.get(tenant, id);
  }

  @Post(":transferId/decision")
  @RequireStore("inventory.write")
  @HttpCode(200)
  decide(
    @CurrentTenant() tenant: TenantContext,
    @Param("transferId") id: string,
    @Body(new ZodValidationPipe(transferDecisionSchema)) body: TransferDecisionInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.transfers.decide(tenant, id, body, meta);
  }
}
