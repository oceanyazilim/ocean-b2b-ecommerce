import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  attachMediaSchema,
  createProductSchema,
  productBulkActionSchema,
  productListQuerySchema,
  productMediaOrderSchema,
  productStatusUpdateSchema,
  setMetafieldsSchema,
  updateProductSchema,
  type CreateProductInput,
  type ProductBulkAction,
  type ProductListQuery,
  type SetMetafieldsInput,
  type UpdateProductInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../../common/http/request-meta";
import { CurrentTenant } from "../../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { MetafieldsService } from "../metafields/metafields.service";
import { ProductsService } from "./products.service";

@Controller("stores/:storeId/products")
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly metafields: MetafieldsService,
  ) {}

  @Get()
  @RequireStore("products.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery,
  ) {
    return this.products.list(tenant, query);
  }

  @Post()
  @RequireStore("products.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.products.create(tenant, body, meta);
  }

  @Post("reindex-search")
  @RequireStore("products.write")
  @HttpCode(200)
  reindexSearch(@CurrentTenant() tenant: TenantContext) {
    return this.products.reindexSearch(tenant);
  }

  @Post("bulk")
  @RequireStore("products.write")
  @HttpCode(200)
  bulk(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(productBulkActionSchema)) body: ProductBulkAction,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.products.bulk(tenant, body, meta);
  }

  @Get("export")
  @RequireStore("products.read")
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", 'attachment; filename="products.csv"')
  exportCsv(@CurrentTenant() tenant: TenantContext) {
    return this.products.exportCsv(tenant);
  }

  @Get(":productId")
  @RequireStore("products.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("productId") id: string) {
    return this.products.get(tenant, id);
  }

  @Patch(":productId")
  @RequireStore("products.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.products.update(tenant, id, body, meta);
  }

  @Delete(":productId")
  @RequireStore("products.delete")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.products.remove(tenant, id, meta);
  }

  @Post(":productId/status")
  @RequireStore("products.write")
  @HttpCode(200)
  setStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") id: string,
    @Body(new ZodValidationPipe(productStatusUpdateSchema))
    body: { status: "draft" | "active" | "archived" },
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.products.setStatus(tenant, id, body.status, meta);
  }

  @Post(":productId/media")
  @RequireStore("products.write")
  @HttpCode(200)
  attachMedia(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") id: string,
    @Body(new ZodValidationPipe(attachMediaSchema)) body: { mediaId: string },
  ) {
    return this.products.attachMedia(tenant, id, body.mediaId);
  }

  @Delete(":productId/media/:mediaId")
  @RequireStore("products.write")
  @HttpCode(200)
  detachMedia(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") id: string,
    @Param("mediaId") mediaId: string,
  ) {
    return this.products.detachMedia(tenant, id, mediaId);
  }

  @Patch(":productId/media")
  @RequireStore("products.write")
  reorderMedia(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") id: string,
    @Body(new ZodValidationPipe(productMediaOrderSchema)) body: { order: string[] },
  ) {
    return this.products.reorderMedia(tenant, id, body.order);
  }

  @Get(":productId/metafields")
  @RequireStore("products.read")
  async getMetafields(@CurrentTenant() tenant: TenantContext, @Param("productId") id: string) {
    await this.products.get(tenant, id);
    return this.metafields.getForOwner(tenant, "product", id);
  }

  @Patch(":productId/metafields")
  @RequireStore("products.write")
  async setMetafields(
    @CurrentTenant() tenant: TenantContext,
    @Param("productId") id: string,
    @Body(new ZodValidationPipe(setMetafieldsSchema)) body: SetMetafieldsInput,
  ) {
    await this.products.get(tenant, id);
    return this.metafields.setForOwner(tenant, "product", id, body.metafields);
  }
}
