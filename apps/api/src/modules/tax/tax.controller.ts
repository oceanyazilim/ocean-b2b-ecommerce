import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import {
  taxClassInputSchema,
  taxRegistrationInputSchema,
  taxRuleInputSchema,
  updateTaxClassSchema,
  updateTaxRegistrationSchema,
  updateTaxRuleSchema,
  updateTaxSettingsSchema,
  type TaxClassInput,
  type TaxRegistrationInput,
  type TaxRuleInput,
  type UpdateTaxClassInput,
  type UpdateTaxRegistrationInput,
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

  // ---- Registrations (Settings -> Taxes & Duties -> Registrations, spec section 21) --------

  @Get("registrations")
  @RequireStore("taxes.read")
  listRegistrations(@CurrentTenant() tenant: TenantContext) {
    return this.tax.listRegistrations(tenant);
  }

  @Post("registrations")
  @RequireStore("taxes.write")
  createRegistration(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(taxRegistrationInputSchema)) body: TaxRegistrationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tax.createRegistration(tenant, body, meta);
  }

  @Patch("registrations/:registrationId")
  @RequireStore("taxes.write")
  updateRegistration(
    @CurrentTenant() tenant: TenantContext,
    @Param("registrationId") id: string,
    @Body(new ZodValidationPipe(updateTaxRegistrationSchema)) body: UpdateTaxRegistrationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tax.updateRegistration(tenant, id, body, meta);
  }

  @Delete("registrations/:registrationId")
  @RequireStore("taxes.write")
  @HttpCode(204)
  async removeRegistration(
    @CurrentTenant() tenant: TenantContext,
    @Param("registrationId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.tax.removeRegistration(tenant, id, meta);
  }

  // ---- Tax classes (spec section 24) --------------------------------------------------------

  @Get("classes")
  @RequireStore("taxes.read")
  listClasses(@CurrentTenant() tenant: TenantContext) {
    return this.tax.listTaxClasses(tenant);
  }

  @Post("classes")
  @RequireStore("taxes.write")
  createClass(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(taxClassInputSchema)) body: TaxClassInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tax.createTaxClass(tenant, body, meta);
  }

  @Patch("classes/:classId")
  @RequireStore("taxes.write")
  updateClass(
    @CurrentTenant() tenant: TenantContext,
    @Param("classId") id: string,
    @Body(new ZodValidationPipe(updateTaxClassSchema)) body: UpdateTaxClassInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tax.updateTaxClass(tenant, id, body, meta);
  }

  @Delete("classes/:classId")
  @RequireStore("taxes.write")
  @HttpCode(204)
  async removeClass(
    @CurrentTenant() tenant: TenantContext,
    @Param("classId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.tax.removeTaxClass(tenant, id, meta);
  }

  // ---- TaxProvider info (spec section 50/51) & platform warnings (spec section 52) ----------

  @Get("provider")
  @RequireStore("taxes.read")
  getProvider() {
    return this.tax.getProviderInfo();
  }

  @Get("warnings")
  @RequireStore("taxes.read")
  getWarnings(@CurrentTenant() tenant: TenantContext) {
    return this.tax.getMarketWarnings(tenant);
  }
}
