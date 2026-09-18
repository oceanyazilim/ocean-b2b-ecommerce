import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  pageInputSchema,
  updatePageSchema,
  type PageInput,
  type UpdatePageInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ContentService } from "./content.service";

@Controller("stores/:storeId/pages")
export class PagesController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @RequireStore("content.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.content.listPages(tenant);
  }
  
  @Get(":pageId")
  @RequireStore("content.read")
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param("pageId") id: string,
  ) {
    return this.content.getPage(tenant, id);
  }

  @Post()
  @RequireStore("content.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(pageInputSchema)) body: PageInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.content.createPage(tenant, body, meta);
  }

  @Patch(":pageId")
  @RequireStore("content.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("pageId") id: string,
    @Body(new ZodValidationPipe(updatePageSchema)) body: UpdatePageInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.content.updatePage(tenant, id, body, meta);
  }

  @Delete(":pageId")
  @RequireStore("content.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("pageId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.content.removePage(tenant, id, meta);
  }
}
