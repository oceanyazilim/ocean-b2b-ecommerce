import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  contractPriceListQuerySchema,
  createVolumeRuleSchema,
  pricingQuoteSchema,
  updateVolumeRuleSchema,
  upsertContractPriceSchema,
  upsertQuantityRuleSchema,
  variantSearchQuerySchema,
  type ContractPriceListQuery,
  type CreateVolumeRuleInput,
  type PricingQuoteInput,
  type UpdateVolumeRuleInput,
  type UpsertContractPriceInput,
  type UpsertQuantityRuleInput,
  type VariantSearchQuery,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { InventoryService } from "../inventory/inventory.service";
import { PricingRulesService } from "./pricing-rules.service";
import { PricingService } from "./pricing.service";

@Controller("stores/:storeId/pricing")
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly rules: PricingRulesService,
    private readonly inventory: InventoryService,
  ) {}

  // Price simulator for staff and the boundary carts/checkout call later.
  @Post("quote")
  @RequireStore("pricing.read")
  @HttpCode(200)
  quote(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(pricingQuoteSchema)) body: PricingQuoteInput,
  ) {
    return this.pricing.quote(tenant, body);
  }

  @Get("variants")
  @RequireStore("pricing.read")
  variants(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(variantSearchQuerySchema)) query: VariantSearchQuery,
  ) {
    return this.inventory.searchVariants(tenant, query);
  }

  @Get("companies/:companyId")
  @RequireStore("pricing.read")
  companyOverview(@CurrentTenant() tenant: TenantContext, @Param("companyId") companyId: string) {
    return this.pricing.companyOverview(tenant, companyId);
  }

  // ---- volume rules -----------------------------------------------------------------------------

  @Get("volume-rules")
  @RequireStore("pricing.read")
  listVolumeRules(@CurrentTenant() tenant: TenantContext) {
    return this.rules.listVolumeRules(tenant);
  }

  @Post("volume-rules")
  @RequireStore("pricing.write")
  createVolumeRule(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createVolumeRuleSchema)) body: CreateVolumeRuleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.rules.createVolumeRule(tenant, body, meta);
  }

  @Patch("volume-rules/:ruleId")
  @RequireStore("pricing.write")
  updateVolumeRule(
    @CurrentTenant() tenant: TenantContext,
    @Param("ruleId") id: string,
    @Body(new ZodValidationPipe(updateVolumeRuleSchema)) body: UpdateVolumeRuleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.rules.updateVolumeRule(tenant, id, body, meta);
  }

  @Delete("volume-rules/:ruleId")
  @RequireStore("pricing.write")
  @HttpCode(204)
  async removeVolumeRule(
    @CurrentTenant() tenant: TenantContext,
    @Param("ruleId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.rules.removeVolumeRule(tenant, id, meta);
  }

  // ---- quantity rules ---------------------------------------------------------------------------

  @Get("quantity-rules")
  @RequireStore("pricing.read")
  listQuantityRules(@CurrentTenant() tenant: TenantContext) {
    return this.rules.listQuantityRules(tenant);
  }

  @Put("quantity-rules")
  @RequireStore("pricing.write")
  upsertQuantityRule(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(upsertQuantityRuleSchema)) body: UpsertQuantityRuleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.rules.upsertQuantityRule(tenant, body, meta);
  }

  @Delete("quantity-rules/:ruleId")
  @RequireStore("pricing.write")
  @HttpCode(204)
  async removeQuantityRule(
    @CurrentTenant() tenant: TenantContext,
    @Param("ruleId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.rules.removeQuantityRule(tenant, id, meta);
  }

  // ---- contract prices --------------------------------------------------------------------------

  @Get("contract-prices")
  @RequireStore("pricing.read")
  listContractPrices(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(contractPriceListQuerySchema)) query: ContractPriceListQuery,
  ) {
    return this.rules.listContractPrices(tenant, query);
  }

  @Put("contract-prices")
  @RequireStore("pricing.write")
  upsertContractPrice(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(upsertContractPriceSchema)) body: UpsertContractPriceInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.rules.upsertContractPrice(tenant, body, meta);
  }

  @Delete("contract-prices/:contractPriceId")
  @RequireStore("pricing.write")
  @HttpCode(204)
  async removeContractPrice(
    @CurrentTenant() tenant: TenantContext,
    @Param("contractPriceId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.rules.removeContractPrice(tenant, id, meta);
  }
}
