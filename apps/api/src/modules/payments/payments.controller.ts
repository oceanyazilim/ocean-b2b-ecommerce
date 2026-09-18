import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  confirmPaymentSchema,
  createPaymentSchema,
  createRefundSchema,
  type ConfirmPaymentInput,
  type CreatePaymentInput,
  type CreateRefundInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PaymentsService } from "./payments.service";

@Controller("stores/:storeId/orders/:orderId/payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequireStore("orders.read")
  list(@CurrentTenant() tenant: TenantContext, @Param("orderId") orderId: string) {
    return this.payments.list(tenant, orderId);
  }

  @Post()
  @RequireStore("orders.write")
  charge(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.payments.charge(tenant, orderId, body, meta);
  }

  @Post(":paymentId/confirm")
  @RequireStore("orders.write")
  @HttpCode(200)
  confirm(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("paymentId") paymentId: string,
    @Body(new ZodValidationPipe(confirmPaymentSchema)) body: ConfirmPaymentInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.payments.confirm(tenant, orderId, paymentId, body, meta);
  }

  @Post(":paymentId/void")
  @RequireStore("orders.write")
  @HttpCode(200)
  void(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Param("paymentId") paymentId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.payments.void(tenant, orderId, paymentId, meta);
  }
}

@Controller("stores/:storeId/orders/:orderId/refunds")
export class RefundsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequireStore("orders.read")
  list(@CurrentTenant() tenant: TenantContext, @Param("orderId") orderId: string) {
    return this.payments.listRefunds(tenant, orderId);
  }

  @Post()
  @RequireStore("orders.refund")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") orderId: string,
    @Body(new ZodValidationPipe(createRefundSchema)) body: CreateRefundInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.payments.createRefund(tenant, orderId, body, meta);
  }
}
