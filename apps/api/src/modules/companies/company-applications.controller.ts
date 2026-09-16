import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  approveCompanyApplicationSchema,
  companyApplicationListQuerySchema,
  rejectCompanyApplicationSchema,
  submitCompanyApplicationSchema,
  type ApproveCompanyApplicationInput,
  type CompanyApplicationListQuery,
  type RejectCompanyApplicationInput,
  type SubmitCompanyApplicationInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CompanyApplicationsService } from "./company-applications.service";

// Merchant-side review of wholesale account applications. The public submission endpoint
// arrives with the Storefront API (Phase 8); staff can key applications in meanwhile.
@Controller("stores/:storeId/company-applications")
export class CompanyApplicationsController {
  constructor(private readonly applications: CompanyApplicationsService) {}

  @Get()
  @RequireStore("companies.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(companyApplicationListQuerySchema))
    query: CompanyApplicationListQuery,
  ) {
    return this.applications.list(tenant, query);
  }

  @Post()
  @RequireStore("companies.write")
  submit(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(submitCompanyApplicationSchema))
    body: SubmitCompanyApplicationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.applications.submit(tenant, body, "admin", meta);
  }

  @Get(":applicationId")
  @RequireStore("companies.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("applicationId") id: string) {
    return this.applications.get(tenant, id);
  }

  @Post(":applicationId/review")
  @RequireStore("companies.write")
  @HttpCode(200)
  review(
    @CurrentTenant() tenant: TenantContext,
    @Param("applicationId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.applications.startReview(tenant, id, meta);
  }

  @Post(":applicationId/approve")
  @RequireStore("companies.write")
  @HttpCode(200)
  approve(
    @CurrentTenant() tenant: TenantContext,
    @Param("applicationId") id: string,
    @Body(new ZodValidationPipe(approveCompanyApplicationSchema))
    body: ApproveCompanyApplicationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.applications.approve(tenant, id, body, meta);
  }

  @Post(":applicationId/reject")
  @RequireStore("companies.write")
  @HttpCode(200)
  reject(
    @CurrentTenant() tenant: TenantContext,
    @Param("applicationId") id: string,
    @Body(new ZodValidationPipe(rejectCompanyApplicationSchema))
    body: RejectCompanyApplicationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.applications.reject(tenant, id, body.note, meta);
  }
}
