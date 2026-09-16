import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  companyListQuerySchema,
  companySearchQuerySchema,
  companyStatusUpdateSchema,
  createCompanySchema,
  setMetafieldsSchema,
  updateCompanySchema,
  type CompanyListQuery,
  type CompanySearchQuery,
  type CompanyStatus,
  type CreateCompanyInput,
  type SetMetafieldsInput,
  type UpdateCompanyInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { MetafieldsService } from "../catalog/metafields/metafields.service";
import { CompaniesService } from "./companies.service";

@Controller("stores/:storeId/companies")
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly metafields: MetafieldsService,
  ) {}

  @Get()
  @RequireStore("companies.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(companyListQuerySchema)) query: CompanyListQuery,
  ) {
    return this.companies.list(tenant, query);
  }

  @Get("stats")
  @RequireStore("companies.read")
  stats(@CurrentTenant() tenant: TenantContext) {
    return this.companies.stats(tenant);
  }

  @Get("search")
  @RequireStore("companies.read")
  search(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(companySearchQuerySchema)) query: CompanySearchQuery,
  ) {
    return this.companies.search(tenant, query);
  }

  @Get("account-managers")
  @RequireStore("companies.read")
  accountManagers(@CurrentTenant() tenant: TenantContext) {
    return this.companies.accountManagerCandidates(tenant);
  }

  @Post()
  @RequireStore("companies.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCompanySchema)) body: CreateCompanyInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.create(tenant, body, meta);
  }

  @Get(":companyId")
  @RequireStore("companies.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("companyId") id: string) {
    return this.companies.get(tenant, id);
  }

  @Patch(":companyId")
  @RequireStore("companies.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") id: string,
    @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.update(tenant, id, body, meta);
  }

  @Post(":companyId/status")
  @RequireStore("companies.write")
  @HttpCode(200)
  setStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") id: string,
    @Body(new ZodValidationPipe(companyStatusUpdateSchema)) body: { status: CompanyStatus },
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.setStatus(tenant, id, body.status, meta);
  }

  @Delete(":companyId")
  @RequireStore("companies.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.companies.remove(tenant, id, meta);
  }

  @Get(":companyId/metafields")
  @RequireStore("companies.read")
  async getMetafields(@CurrentTenant() tenant: TenantContext, @Param("companyId") id: string) {
    await this.companies.require(tenant, id);
    return this.metafields.getForOwner(tenant, "company", id);
  }

  @Patch(":companyId/metafields")
  @RequireStore("companies.write")
  async setMetafields(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") id: string,
    @Body(new ZodValidationPipe(setMetafieldsSchema)) body: SetMetafieldsInput,
  ) {
    await this.companies.require(tenant, id);
    return this.metafields.setForOwner(tenant, "company", id, body.metafields);
  }
}
