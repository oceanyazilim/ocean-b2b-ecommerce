import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  storefrontArticleListQuerySchema,
  storefrontCollectionListQuerySchema,
  storefrontProductListQuerySchema,
  storefrontSearchQuerySchema,
  storefrontVariantSearchQuerySchema,
  type ArticleDetail,
  type ArticleSummary,
  type StorefrontArticleListQuery,
  type StorefrontCollectionListQuery,
  type StorefrontProductListQuery,
  type StorefrontSearchQuery,
  type StorefrontVariantSearchQuery,
} from "@ocean/types";

import { Public } from "../../common/auth/public.decorator";
import { NotFoundError } from "../../common/errors/domain-error";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { StorefrontGuard } from "../../common/tenant/storefront.guard";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ContentService } from "../content/content.service";
import { MarketsService } from "../markets/markets.service";
import { PaymentMethodsService } from "../payments/payment-methods.service";
import { ThemesService } from "../themes/themes.service";
import { StorefrontCatalogService } from "./storefront-catalog.service";

@Controller("storefront/v1")
@Public()
@UseGuards(StorefrontGuard)
export class StorefrontController {
  constructor(
    private readonly catalog: StorefrontCatalogService,
    private readonly content: ContentService,
    private readonly markets: MarketsService,
    private readonly themes: ThemesService,
    private readonly paymentMethods: PaymentMethodsService,
  ) {}

  @Get("products")
  listProducts(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(storefrontProductListQuerySchema)) query: StorefrontProductListQuery,
  ) {
    return this.catalog.listProducts(tenant, query);
  }

  @Get("search")
  search(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(storefrontSearchQuerySchema)) query: StorefrontSearchQuery,
  ) {
    return this.catalog.search(tenant, query);
  }

  // Quick order (spec §25): declared before the :idOrHandle route below so a literal path
  // segment never gets swallowed as a product id/handle.
  @Get("products/variant-search")
  searchVariants(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(storefrontVariantSearchQuerySchema)) query: StorefrontVariantSearchQuery,
  ) {
    return this.catalog.searchVariants(tenant, query);
  }

  @Get("products/:idOrHandle")
  getProduct(@CurrentTenant() tenant: TenantContext, @Param("idOrHandle") id: string) {
    return this.catalog.getProduct(tenant, id);
  }

  @Get("collections")
  listCollections(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(storefrontCollectionListQuerySchema))
    query: StorefrontCollectionListQuery,
  ) {
    return this.catalog.listCollections(tenant, query);
  }

  @Get("collections/:handle")
  getCollection(@CurrentTenant() tenant: TenantContext, @Param("handle") handle: string) {
    return this.catalog.getCollection(tenant, handle);
  }

  @Get("pages")
  listPages(@CurrentTenant() tenant: TenantContext) {
    return this.content.listPublishedPages(tenant);
  }

  @Get("pages/:handle")
  getPage(@CurrentTenant() tenant: TenantContext, @Param("handle") handle: string) {
    return this.content.getPublishedPage(tenant, handle);
  }

  @Get("blogs")
  async listBlogs(@CurrentTenant() tenant: TenantContext) {
    const blogs = await this.content.listPublishedBlogs(tenant);
    return blogs.map((b) => ({ id: b.id, title: b.title, handle: b.handle }));
  }

  @Get("blogs/:handle")
  async getBlog(
    @CurrentTenant() tenant: TenantContext,
    @Param("handle") handle: string,
    @Query(new ZodValidationPipe(storefrontArticleListQuerySchema)) query: StorefrontArticleListQuery,
  ) {
    const blog = await this.content.getBlogByHandle(tenant, handle);
    const articles = await this.content.listPublishedArticles(tenant, blog.id, query);
    return {
      blog: { id: blog.id, title: blog.title, handle: blog.handle },
      articles: {
        data: articles.data.map((a) => this.toStorefrontArticleSummary(a)),
        pageInfo: articles.pageInfo,
      },
    };
  }

  @Get("blogs/:handle/articles/:articleHandle")
  async getArticle(
    @CurrentTenant() tenant: TenantContext,
    @Param("handle") handle: string,
    @Param("articleHandle") articleHandle: string,
  ) {
    const [blog, article] = await Promise.all([
      this.content.getBlogByHandle(tenant, handle),
      this.content.getPublishedArticle(tenant, handle, articleHandle),
    ]);
    return this.toStorefrontArticleDetail(article, blog);
  }

  private toStorefrontArticleSummary(a: ArticleSummary) {
    return {
      id: a.id,
      title: a.title,
      handle: a.handle,
      excerpt: a.excerpt,
      authorName: a.authorName,
      featuredImage: a.featuredImageUrl ? { url: a.featuredImageUrl, alt: a.featuredImageAlt } : null,
      tags: a.tags,
      publishedAt: a.publishedAt,
    };
  }

  private toStorefrontArticleDetail(a: ArticleDetail, blog: { id: string; title: string; handle: string }) {
    return {
      ...this.toStorefrontArticleSummary(a),
      bodyRich: a.bodyRich,
      seoTitle: a.seoTitle,
      seoDescription: a.seoDescription,
      blog,
    };
  }

  @Get("menus")
  listMenus(@CurrentTenant() tenant: TenantContext) {
    return this.content.listMenus(tenant);
  }

  @Get("markets")
  listMarkets(@CurrentTenant() tenant: TenantContext) {
    return this.markets.list(tenant);
  }

  @Get("theme")
  getTheme(@CurrentTenant() tenant: TenantContext) {
    return this.themes.getPublishedTheme(tenant);
  }

  // Used by the theme editor's live-preview iframe (a separate, unauthenticated-to-the-admin
  // origin) to render a specific — usually still-draft — version. The token alone authorizes
  // it; no store/session check beyond that the token hasn't expired.
  @Get("theme/preview")
  async getPreviewTheme(@Query("token") token: string | undefined) {
    if (!token) throw new NotFoundError("Preview");
    const theme = await this.themes.resolvePreviewTheme(token);
    if (!theme) throw new NotFoundError("Preview");
    return theme;
  }

  @Get("payment-methods")
  async listPaymentMethods(@CurrentTenant() tenant: TenantContext) {
    return (await this.paymentMethods.list(tenant)).filter((m) => m.isEnabled);
  }

  @Get("context")
  getContext(@CurrentTenant() tenant: TenantContext) {
    return { storeId: tenant.storeId, signedIn: tenant.actor.type === "customer" };
  }
}
