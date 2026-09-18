import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  adjustCreditSchema,
  createCreditAccountInputSchema,
  updateCreditAccountSchema,
  type AdjustCreditInput,
  type CreateCreditAccountInput,
  type UpdateCreditAccountInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CreditService } from "./credit.service";

@Controller("stores/:storeId/credit-accounts")
export class CreditController {
  constructor(private readonly credit: CreditService) {}

  @Get()
  @RequireStore("credit.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.credit.list(tenant);
  }

  @Get(":accountId")
  @RequireStore("credit.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("accountId") id: string) {
    return this.credit.get(tenant, id);
  }

  @Post()
  @RequireStore("credit.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCreditAccountInputSchema)) body: CreateCreditAccountInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.credit.create(tenant, body, meta);
  }

  @Patch(":accountId")
  @RequireStore("credit.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("accountId") id: string,
    @Body(new ZodValidationPipe(updateCreditAccountSchema)) body: UpdateCreditAccountInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.credit.update(tenant, id, body, meta);
  }

  @Post(":accountId/adjust")
  @RequireStore("credit.write")
  adjust(
    @CurrentTenant() tenant: TenantContext,
    @Param("accountId") id: string,
    @Body(new ZodValidationPipe(adjustCreditSchema)) body: AdjustCreditInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.credit.adjust(tenant, id, body, meta);
  }
}
