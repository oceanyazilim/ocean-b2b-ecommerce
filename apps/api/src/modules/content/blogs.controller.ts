import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  blogInputSchema,
  updateBlogSchema,
  type BlogInput,
  type UpdateBlogInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ContentService } from "./content.service";

@Controller("stores/:storeId/blogs")
export class BlogsController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @RequireStore("content.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.content.listBlogs(tenant);
  }

  @Get(":blogId")
  @RequireStore("content.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("blogId") id: string) {
    return this.content.getBlog(tenant, id);
  }

  @Post()
  @RequireStore("content.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(blogInputSchema)) body: BlogInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.content.createBlog(tenant, body, meta);
  }

  @Patch(":blogId")
  @RequireStore("content.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("blogId") id: string,
    @Body(new ZodValidationPipe(updateBlogSchema)) body: UpdateBlogInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.content.updateBlog(tenant, id, body, meta);
  }

  @Delete(":blogId")
  @RequireStore("content.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("blogId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.content.removeBlog(tenant, id, meta);
  }
}
