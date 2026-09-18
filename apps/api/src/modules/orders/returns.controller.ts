import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  closeReturnSchema,
  createReturnSchema,
  declineReturnSchema,
  receiveReturnSchema,
  type CloseReturnInput,
  type CreateReturnInput,
  type DeclineReturnInput,
  type ReceiveReturnInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ReturnsService } from "./returns.service";

@Controller("stores/:storeId/orders/:orderId/returns")
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequireStore("returns.read")
  list(@CurrentTenant() tenant: TenantContext, @Param("orderId") orderId: string) {
    return this.returns.list(tenant, orderId);
  }

  @Post()
  @RequireStore("returns.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Body(new ZodValidationPipe(createReturnSchema)) body: CreateReturnInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.returns.create(tenant, orderId, body, meta);
  }

  @Post(":returnId/approve")
  @RequireStore("returns.write")
  @HttpCode(200)
  approve(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("returnId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.returns.approve(tenant, orderId, id, meta);
  }

  @Post(":returnId/decline")
  @RequireStore("returns.write")
  @HttpCode(200)
  decline(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("returnId") id: string,
    @Body(new ZodValidationPipe(declineReturnSchema)) body: DeclineReturnInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.returns.decline(tenant, orderId, id, body, meta);
  }

  @Post(":returnId/receive")
  @RequireStore("returns.write")
  @HttpCode(200)
  receive(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("returnId") id: string,
    @Body(new ZodValidationPipe(receiveReturnSchema)) body: ReceiveReturnInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.returns.receive(tenant, orderId, id, body, meta);
  }

  @Post(":returnId/close")
  @RequireStore("returns.write")
  @HttpCode(200)
  close(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("returnId") id: string,
    @Body(new ZodValidationPipe(closeReturnSchema)) body: CloseReturnInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.returns.close(tenant, orderId, id, body, meta);
  }
}
