import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import {
  taxRuleInputSchema,
  updateTaxRuleSchema,
  updateTaxSettingsSchema,
  type TaxRuleInput,
  type UpdateTaxRuleInput,
  type UpdateTaxSettingsInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { TaxService } from "./tax.service";

@Controller("stores/:storeId/tax")
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get("rules")
  @RequireStore("taxes.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.tax.list(tenant);
  }

  @Post("rules")
  @RequireStore("taxes.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(taxRuleInputSchema)) body: TaxRuleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tax.create(tenant, body, meta);
  }

  @Patch("rules/:ruleId")
  @RequireStore("taxes.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("ruleId") id: string,
    @Body(new ZodValidationPipe(updateTaxRuleSchema)) body: UpdateTaxRuleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tax.update(tenant, id, body, meta);
  }

  @Delete("rules/:ruleId")
  @RequireStore("taxes.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("ruleId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.tax.remove(tenant, id, meta);
  }

  @Get("settings")
  @RequireStore("taxes.read")
  getSettings(@CurrentTenant() tenant: TenantContext) {
    return this.tax.getSettings(tenant);
  }

  @Put("settings")
  @RequireStore("taxes.write")
  updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateTaxSettingsSchema)) body: UpdateTaxSettingsInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tax.updateSettings(tenant, body.pricesIncludeTax, meta);
  }
}
