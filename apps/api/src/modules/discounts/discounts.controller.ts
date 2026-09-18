import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  createDiscountInputSchema,
  updateDiscountInputSchema,
  validateDiscountCodeSchema,
  type CreateDiscountInput,
  type UpdateDiscountInput,
  type ValidateDiscountCodeInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { DiscountsService } from "./discounts.service";

@Controller("stores/:storeId/discounts")
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get()
  @RequireStore("discounts.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.discounts.list(tenant);
  }

  @Get(":discountId")
  @RequireStore("discounts.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("discountId") id: string) {
    return this.discounts.get(tenant, id);
  }

  @Post()
  @RequireStore("discounts.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createDiscountInputSchema)) body: CreateDiscountInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.discounts.create(tenant, body, meta);
  }

  @Patch(":discountId")
  @RequireStore("discounts.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("discountId") id: string,
    @Body(new ZodValidationPipe(updateDiscountInputSchema)) body: UpdateDiscountInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.discounts.update(tenant, id, body, meta);
  }

  @Delete(":discountId")
  @RequireStore("discounts.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("discountId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.discounts.remove(tenant, id, meta);
  }

  @Post("validate-code")
  @RequireStore("discounts.read")
  @HttpCode(200)
  async validateCode(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(validateDiscountCodeSchema)) body: ValidateDiscountCodeInput,
  ) {
    return { valid: await this.discounts.resolveCode(tenant, body.code, body.subtotal) };
  }
}
