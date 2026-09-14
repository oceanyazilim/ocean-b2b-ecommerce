import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  inventoryAdjustmentSchema,
  inventoryItemInputSchema,
  inventoryListQuerySchema,
  inventoryTransferSchema,
  movementListQuerySchema,
  variantSearchQuerySchema,
  type InventoryAdjustmentInput,
  type InventoryItemInput,
  type InventoryListQuery,
  type InventoryTransferInput,
  type MovementListQuery,
  type VariantSearchQuery,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { InventoryService } from "./inventory.service";

@Controller("stores/:storeId/inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("stats")
  @RequireStore("inventory.read")
  stats(@CurrentTenant() tenant: TenantContext) {
    return this.inventory.stats(tenant);
  }

  @Get("items")
  @RequireStore("inventory.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(inventoryListQuerySchema)) query: InventoryListQuery,
  ) {
    return this.inventory.list(tenant, query);
  }

  @Post("items")
  @RequireStore("inventory.write")
  createItem(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(inventoryItemInputSchema)) body: InventoryItemInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.inventory.createItem(tenant, body, meta);
  }

  @Get("items/:itemId")
  @RequireStore("inventory.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("itemId") id: string) {
    return this.inventory.get(tenant, id);
  }

  @Get("variants")
  @RequireStore("inventory.read")
  variants(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(variantSearchQuerySchema)) query: VariantSearchQuery,
  ) {
    return this.inventory.searchVariants(tenant, query);
  }

  @Post("adjustments")
  @RequireStore("inventory.write")
  adjust(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(inventoryAdjustmentSchema)) body: InventoryAdjustmentInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.inventory.adjust(tenant, body, meta);
  }

  @Post("transfers")
  @RequireStore("inventory.write")
  transfer(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(inventoryTransferSchema)) body: InventoryTransferInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.inventory.transfer(tenant, body, meta);
  }

  @Get("movements")
  @RequireStore("inventory.read")
  movements(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(movementListQuerySchema)) query: MovementListQuery,
  ) {
    return this.inventory.listMovements(tenant, query);
  }
}
