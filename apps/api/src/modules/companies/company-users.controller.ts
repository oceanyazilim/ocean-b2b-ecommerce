import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  addCompanyUserSchema,
  updateCompanyUserSchema,
  type AddCompanyUserInput,
  type UpdateCompanyUserInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CompanyUsersService } from "./company-users.service";

@Controller("stores/:storeId/companies/:companyId/users")
export class CompanyUsersController {
  constructor(private readonly users: CompanyUsersService) {}

  @Get()
  @RequireStore("companies.read")
  list(@CurrentTenant() tenant: TenantContext, @Param("companyId") companyId: string) {
    return this.users.list(tenant, companyId);
  }

  @Post()
  @RequireStore("companies.write")
  add(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(addCompanyUserSchema)) body: AddCompanyUserInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.add(tenant, companyId, body, meta);
  }

  @Patch(":companyUserId")
  @RequireStore("companies.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Param("companyUserId") id: string,
    @Body(new ZodValidationPipe(updateCompanyUserSchema)) body: UpdateCompanyUserInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.update(tenant, companyId, id, body, meta);
  }

  @Delete(":companyUserId")
  @RequireStore("companies.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Param("companyUserId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.users.remove(tenant, companyId, id, meta);
  }
}
