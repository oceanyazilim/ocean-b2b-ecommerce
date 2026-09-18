import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  paymentMethodInputSchema,
  updatePaymentMethodSchema,
  type PaymentMethodInput,
  type UpdatePaymentMethodInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PaymentMethodsService } from "./payment-methods.service";

@Controller("stores/:storeId/payment-methods")
export class PaymentMethodsController {
  constructor(private readonly methods: PaymentMethodsService) {}

  @Get()
  @RequireStore("payments.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.methods.list(tenant);
  }

  @Get(":methodId")
  @RequireStore("payments.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("methodId") id: string) {
    return this.methods.get(tenant, id);
  }

  @Post()
  @RequireStore("payments.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(paymentMethodInputSchema)) body: PaymentMethodInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.methods.create(tenant, body, meta);
  }

  @Patch(":methodId")
  @RequireStore("payments.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("methodId") id: string,
    @Body(new ZodValidationPipe(updatePaymentMethodSchema)) body: UpdatePaymentMethodInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.methods.update(tenant, id, body, meta);
  }

  @Delete(":methodId")
  @RequireStore("payments.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("methodId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.methods.remove(tenant, id, meta);
  }
}
