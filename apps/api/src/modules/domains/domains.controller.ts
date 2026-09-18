import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  domainInputSchema,
  updateDomainSchema,
  type DomainInput,
  type UpdateDomainInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { DomainsService } from "./domains.service";

@Controller("stores/:storeId/domains")
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  @RequireStore("settings.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.domains.list(tenant);
  }
  
  @Get(":domainId")
  @RequireStore("settings.read")
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param("domainId") id: string,
  ) {
    return this.domains.get(tenant, id);
  }

  @Post()
  @RequireStore("settings.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(domainInputSchema)) body: DomainInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.domains.create(tenant, body, meta);
  }

  @Patch(":domainId")
  @RequireStore("settings.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("domainId") id: string,
    @Body(new ZodValidationPipe(updateDomainSchema)) body: UpdateDomainInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.domains.update(tenant, id, body, meta);
  }

  @Post(":domainId/verify")
  @RequireStore("settings.write")
  verify(
    @CurrentTenant() tenant: TenantContext,
    @Param("domainId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.domains.verify(tenant, id, meta);
  }

  @Delete(":domainId")
  @RequireStore("settings.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("domainId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.domains.remove(tenant, id, meta);
  }
}
