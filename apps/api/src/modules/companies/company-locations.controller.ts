import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  createCompanyLocationSchema,
  updateCompanyLocationSchema,
  type CreateCompanyLocationInput,
  type UpdateCompanyLocationInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CompanyLocationsService } from "./company-locations.service";

@Controller("stores/:storeId/companies/:companyId/locations")
export class CompanyLocationsController {
  constructor(private readonly locations: CompanyLocationsService) {}

  @Get()
  @RequireStore("companies.read")
  list(@CurrentTenant() tenant: TenantContext, @Param("companyId") companyId: string) {
    return this.locations.list(tenant, companyId);
  }

  @Post()
  @RequireStore("companies.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(createCompanyLocationSchema)) body: CreateCompanyLocationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.create(tenant, companyId, body, meta);
  }

  @Get(":locationId")
  @RequireStore("companies.read")
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Param("locationId") id: string,
  ) {
    return this.locations.get(tenant, companyId, id);
  }

  @Patch(":locationId")
  @RequireStore("companies.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Param("locationId") id: string,
    @Body(new ZodValidationPipe(updateCompanyLocationSchema)) body: UpdateCompanyLocationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.update(tenant, companyId, id, body, meta);
  }

  @Post(":locationId/default")
  @RequireStore("companies.write")
  @HttpCode(200)
  setDefault(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Param("locationId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.update(tenant, companyId, id, { isDefault: true, isActive: true }, meta);
  }

  @Delete(":locationId")
  @RequireStore("companies.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Param("locationId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.locations.remove(tenant, companyId, id, meta);
  }
}
