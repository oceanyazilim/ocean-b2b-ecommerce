import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { glossaryTermInputSchema, type GlossaryTermInput } from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { GlossaryService } from "./glossary.service";

@Controller("stores/:storeId/translations/glossary")
export class GlossaryController {
  constructor(private readonly glossary: GlossaryService) {}

  @Get()
  @RequireStore("content.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.glossary.list(tenant);
  }

  @Post()
  @RequireStore("content.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(glossaryTermInputSchema)) body: GlossaryTermInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.glossary.create(tenant, body, meta);
  }

  @Patch(":termId")
  @RequireStore("content.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("termId") id: string,
    @Body(new ZodValidationPipe(glossaryTermInputSchema)) body: GlossaryTermInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.glossary.update(tenant, id, body, meta);
  }

  @Delete(":termId")
  @RequireStore("content.write")
  @HttpCode(204)
  async remove(@CurrentTenant() tenant: TenantContext, @Param("termId") id: string, @ReqMeta() meta: RequestMeta) {
    await this.glossary.remove(tenant, id, meta);
  }
}
