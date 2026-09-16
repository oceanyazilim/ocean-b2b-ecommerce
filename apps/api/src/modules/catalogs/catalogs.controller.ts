import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  assignmentTargetSchema,
  catalogListQuerySchema,
  catalogProductListQuerySchema,
  catalogProductsInputSchema,
  createCatalogSchema,
  updateCatalogSchema,
  type AssignmentTargetInput,
  type CatalogListQuery,
  type CatalogProductListQuery,
  type CatalogProductsInput,
  type CreateCatalogInput,
  type UpdateCatalogInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CatalogsService } from "./catalogs.service";

@Controller("stores/:storeId/catalogs")
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get()
  @RequireStore("catalogs.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(catalogListQuerySchema)) query: CatalogListQuery,
  ) {
    return this.catalogs.list(tenant, query);
  }

  @Post()
  @RequireStore("catalogs.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCatalogSchema)) body: CreateCatalogInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalogs.create(tenant, body, meta);
  }

  @Get(":catalogId")
  @RequireStore("catalogs.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("catalogId") id: string) {
    return this.catalogs.get(tenant, id);
  }

  @Patch(":catalogId")
  @RequireStore("catalogs.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("catalogId") id: string,
    @Body(new ZodValidationPipe(updateCatalogSchema)) body: UpdateCatalogInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalogs.update(tenant, id, body, meta);
  }

  @Delete(":catalogId")
  @RequireStore("catalogs.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("catalogId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.catalogs.remove(tenant, id, meta);
  }

  @Get(":catalogId/products")
  @RequireStore("catalogs.read")
  listProducts(
    @CurrentTenant() tenant: TenantContext,
    @Param("catalogId") id: string,
    @Query(new ZodValidationPipe(catalogProductListQuerySchema)) query: CatalogProductListQuery,
  ) {
    return this.catalogs.listProducts(tenant, id, query);
  }

  @Post(":catalogId/products")
  @RequireStore("catalogs.write")
  @HttpCode(200)
  addProducts(
    @CurrentTenant() tenant: TenantContext,
    @Param("catalogId") id: string,
    @Body(new ZodValidationPipe(catalogProductsInputSchema)) body: CatalogProductsInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalogs.addProducts(tenant, id, body.productIds, meta);
  }

  @Post(":catalogId/products/remove")
  @RequireStore("catalogs.write")
  @HttpCode(200)
  removeProducts(
    @CurrentTenant() tenant: TenantContext,
    @Param("catalogId") id: string,
    @Body(new ZodValidationPipe(catalogProductsInputSchema)) body: CatalogProductsInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalogs.removeProducts(tenant, id, body.productIds, meta);
  }

  @Post(":catalogId/assignments")
  @RequireStore("catalogs.write")
  addAssignment(
    @CurrentTenant() tenant: TenantContext,
    @Param("catalogId") id: string,
    @Body(new ZodValidationPipe(assignmentTargetSchema)) body: AssignmentTargetInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalogs.addAssignment(tenant, id, body, meta);
  }

  @Delete(":catalogId/assignments/:assignmentId")
  @RequireStore("catalogs.write")
  @HttpCode(204)
  async removeAssignment(
    @CurrentTenant() tenant: TenantContext,
    @Param("catalogId") id: string,
    @Param("assignmentId") assignmentId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.catalogs.removeAssignment(tenant, id, assignmentId, meta);
  }
}
