import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  cancelFulfillmentSchema,
  createFulfillmentSchema,
  updateFulfillmentTrackingSchema,
  type CancelFulfillmentInput,
  type CreateFulfillmentInput,
  type UpdateFulfillmentTrackingInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { FulfillmentsService } from "./fulfillments.service";

@Controller("stores/:storeId/orders/:orderId/fulfillments")
export class FulfillmentsController {
  constructor(private readonly fulfillments: FulfillmentsService) {}

  @Get()
  @RequireStore("fulfillments.read")
  list(@CurrentTenant() tenant: TenantContext, @Param("orderId") orderId: string) {
    return this.fulfillments.list(tenant, orderId);
  }

  @Post()
  @RequireStore("fulfillments.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Body(new ZodValidationPipe(createFulfillmentSchema)) body: CreateFulfillmentInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.fulfillments.create(tenant, orderId, body, meta);
  }

  @Post(":fulfillmentId/tracking")
  @RequireStore("fulfillments.write")
  @HttpCode(200)
  updateTracking(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("fulfillmentId") id: string,
    @Body(new ZodValidationPipe(updateFulfillmentTrackingSchema)) body: UpdateFulfillmentTrackingInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.fulfillments.updateTracking(tenant, orderId, id, body, meta);
  }

  @Post(":fulfillmentId/ship")
  @RequireStore("fulfillments.write")
  @HttpCode(200)
  ship(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("fulfillmentId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.fulfillments.markShipped(tenant, orderId, id, meta);
  }

  @Post(":fulfillmentId/deliver")
  @RequireStore("fulfillments.write")
  @HttpCode(200)
  deliver(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("fulfillmentId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.fulfillments.markDelivered(tenant, orderId, id, meta);
  }

  @Post(":fulfillmentId/cancel")
  @RequireStore("fulfillments.write")
  @HttpCode(200)
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("fulfillmentId") id: string,
    @Body(new ZodValidationPipe(cancelFulfillmentSchema)) body: CancelFulfillmentInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.fulfillments.cancel(tenant, orderId, id, body, meta);
  }
}
