import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  collectionListQuerySchema,
  collectionPreviewSchema,
  collectionProductsMutationSchema,
  collectionProductsOrderSchema,
  createCollectionSchema,
  cursorPaginationQuerySchema,
  updateCollectionSchema,
  type CollectionInput,
  type CollectionListQuery,
  type CollectionRule,
  type CursorPaginationQuery,
  type UpdateCollectionInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../../common/http/request-meta";
import { CurrentTenant } from "../../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { CollectionsService } from "./collections.service";

@Controller("stores/:storeId/collections")
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  @RequireStore("collections.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(collectionListQuerySchema)) query: CollectionListQuery,
  ) {
    return this.collections.list(tenant, query);
  }

  @Post()
  @RequireStore("collections.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCollectionSchema)) body: CollectionInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.collections.create(tenant, body, meta);
  }

  @Post("preview")
  @RequireStore("collections.read")
  @HttpCode(200)
  preview(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(collectionPreviewSchema))
    body: { rules: CollectionRule[]; rulesMatchAll: boolean },
  ) {
    return this.collections.previewRules(tenant, body.rules, body.rulesMatchAll);
  }

  @Get(":collectionId")
  @RequireStore("collections.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("collectionId") id: string) {
    return this.collections.get(tenant, id);
  }

  @Patch(":collectionId")
  @RequireStore("collections.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("collectionId") id: string,
    @Body(new ZodValidationPipe(updateCollectionSchema)) body: UpdateCollectionInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.collections.update(tenant, id, body, meta);
  }

  @Delete(":collectionId")
  @RequireStore("collections.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("collectionId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.collections.remove(tenant, id, meta);
  }

  @Get(":collectionId/products")
  @RequireStore("collections.read")
  products(
    @CurrentTenant() tenant: TenantContext,
    @Param("collectionId") id: string,
    @Query(new ZodValidationPipe(cursorPaginationQuerySchema)) query: CursorPaginationQuery,
  ) {
    return this.collections.listProducts(tenant, id, query);
  }

  @Post(":collectionId/products")
  @RequireStore("collections.write")
  @HttpCode(200)
  addProducts(
    @CurrentTenant() tenant: TenantContext,
    @Param("collectionId") id: string,
    @Body(new ZodValidationPipe(collectionProductsMutationSchema)) body: { productIds: string[] },
  ) {
    return this.collections.addProducts(tenant, id, body.productIds);
  }

  @Delete(":collectionId/products")
  @RequireStore("collections.write")
  @HttpCode(200)
  removeProducts(
    @CurrentTenant() tenant: TenantContext,
    @Param("collectionId") id: string,
    @Body(new ZodValidationPipe(collectionProductsMutationSchema)) body: { productIds: string[] },
  ) {
    return this.collections.removeProducts(tenant, id, body.productIds);
  }

  @Patch(":collectionId/products")
  @RequireStore("collections.write")
  @HttpCode(204)
  async reorder(
    @CurrentTenant() tenant: TenantContext,
    @Param("collectionId") id: string,
    @Body(new ZodValidationPipe(collectionProductsOrderSchema)) body: { order: string[] },
  ) {
    await this.collections.reorderProducts(tenant, id, body.order);
  }
}
