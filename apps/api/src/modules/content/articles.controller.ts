import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  articleInputSchema,
  updateArticleSchema,
  type ArticleInput,
  type UpdateArticleInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ContentService } from "./content.service";

@Controller("stores/:storeId/blogs/:blogId/articles")
export class ArticlesController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @RequireStore("content.read")
  list(@CurrentTenant() tenant: TenantContext, @Param("blogId") blogId: string) {
    return this.content.listArticles(tenant, blogId);
  }

  @Get(":articleId")
  @RequireStore("content.read")
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param("blogId") blogId: string,
    @Param("articleId") id: string,
  ) {
    return this.content.getArticle(tenant, blogId, id);
  }

  @Post()
  @RequireStore("content.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Param("blogId") blogId: string,
    @Body(new ZodValidationPipe(articleInputSchema)) body: ArticleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.content.createArticle(tenant, blogId, body, meta);
  }

  @Patch(":articleId")
  @RequireStore("content.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("blogId") blogId: string,
    @Param("articleId") id: string,
    @Body(new ZodValidationPipe(updateArticleSchema)) body: UpdateArticleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.content.updateArticle(tenant, blogId, id, body, meta);
  }

  @Delete(":articleId")
  @RequireStore("content.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("blogId") blogId: string,
    @Param("articleId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.content.removeArticle(tenant, blogId, id, meta);
  }
}
