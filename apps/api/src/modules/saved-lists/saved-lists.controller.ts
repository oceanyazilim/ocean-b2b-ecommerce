import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  addToCartFromListSchema,
  createSavedListInputSchema,
  savedListItemInputSchema,
  updateSavedListItemSchema,
  updateSavedListSchema,
  type AddToCartFromListInput,
  type CreateSavedListInput,
  type SavedListItemInput,
  type UpdateSavedListInput,
  type UpdateSavedListItemInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { SavedListsService } from "./saved-lists.service";

@Controller("stores/:storeId/saved-lists")
export class SavedListsController {
  constructor(private readonly savedLists: SavedListsService) {}

  @Get()
  @RequireStore("savedLists.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.savedLists.list(tenant);
  }

  @Get(":listId")
  @RequireStore("savedLists.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("listId") id: string) {
    return this.savedLists.get(tenant, id);
  }

  @Post()
  @RequireStore("savedLists.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createSavedListInputSchema)) body: CreateSavedListInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.savedLists.create(tenant, body, meta);
  }

  @Patch(":listId")
  @RequireStore("savedLists.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("listId") id: string,
    @Body(new ZodValidationPipe(updateSavedListSchema)) body: UpdateSavedListInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.savedLists.update(tenant, id, body, meta);
  }

  @Delete(":listId")
  @RequireStore("savedLists.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("listId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.savedLists.remove(tenant, id, meta);
  }

  @Post(":listId/items")
  @RequireStore("savedLists.write")
  addItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("listId") id: string,
    @Body(new ZodValidationPipe(savedListItemInputSchema)) body: SavedListItemInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.savedLists.addItem(tenant, id, body, meta);
  }

  @Patch(":listId/items/:itemId")
  @RequireStore("savedLists.write")
  updateItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("listId") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateSavedListItemSchema)) body: UpdateSavedListItemInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.savedLists.updateItem(tenant, id, itemId, body.quantity, meta);
  }

  @Delete(":listId/items/:itemId")
  @RequireStore("savedLists.write")
  removeItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("listId") id: string,
    @Param("itemId") itemId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.savedLists.removeItem(tenant, id, itemId, meta);
  }

  @Post(":listId/add-to-cart")
  @RequireStore("savedLists.write")
  addToCart(
    @CurrentTenant() tenant: TenantContext,
    @Param("listId") id: string,
    @Body(new ZodValidationPipe(addToCartFromListSchema)) body: AddToCartFromListInput,
  ) {
    return this.savedLists.addToCart(tenant, id, body.cartId);
  }
}
