import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  addCartItemSchema,
  checkoutSchema,
  createCartSchema,
  updateCartItemSchema,
  updateCartSchema,
  type AddCartItemInput,
  type CheckoutInput,
  type CreateCartInput,
  type UpdateCartInput,
  type UpdateCartItemInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CartsService } from "./carts.service";

// Staff-side cart access. The customer-facing surface lands with the Storefront API (Phase 8)
// and reuses CartsService unchanged.
@Controller("stores/:storeId/carts")
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Post()
  @RequireStore("orders.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCartSchema)) body: CreateCartInput,
  ) {
    return this.carts.create(tenant, body);
  }

  @Get(":cartId")
  @RequireStore("orders.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("cartId") id: string) {
    return this.carts.get(tenant, id);
  }

  @Patch(":cartId")
  @RequireStore("orders.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("cartId") id: string,
    @Body(new ZodValidationPipe(updateCartSchema)) body: UpdateCartInput,
  ) {
    return this.carts.update(tenant, id, body);
  }

  @Post(":cartId/items")
  @RequireStore("orders.write")
  @HttpCode(200)
  addItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("cartId") id: string,
    @Body(new ZodValidationPipe(addCartItemSchema)) body: AddCartItemInput,
  ) {
    return this.carts.addItem(tenant, id, body);
  }

  @Patch(":cartId/items/:itemId")
  @RequireStore("orders.write")
  updateItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("cartId") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: UpdateCartItemInput,
  ) {
    return this.carts.updateItem(tenant, id, itemId, body.quantity);
  }

  @Delete(":cartId/items/:itemId")
  @RequireStore("orders.write")
  @HttpCode(200)
  removeItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("cartId") id: string,
    @Param("itemId") itemId: string,
  ) {
    return this.carts.removeItem(tenant, id, itemId);
  }

  @Post(":cartId/checkout")
  @RequireStore("orders.write")
  checkout(
    @CurrentTenant() tenant: TenantContext,
    @Param("cartId") id: string,
    @Body(new ZodValidationPipe(checkoutSchema)) body: CheckoutInput,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.carts.checkout(tenant, id, body, idempotencyKey ?? null, meta);
  }
}
