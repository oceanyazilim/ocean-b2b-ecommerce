import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { createPermissionSet, type StorePermission } from "@ocean/permissions";
import {
  oauthTokenInputSchema,
  orderListQuerySchema,
  productListQuerySchema,
  type OAuthTokenInput,
  type OrderListQuery,
  type ProductListQuery,
} from "@ocean/types";

import { Public } from "../../common/auth/public.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ProductsService } from "../catalog/products/products.service";
import { OrdersService } from "../orders/orders.service";
import { ApiKeyGuard, CurrentApiKey, RequireScope, type ApiKeyPrincipal } from "./api-key.guard";
import { DeveloperAppsService } from "./developer-apps.service";

function tenantFromApiKey(key: ApiKeyPrincipal): TenantContext {
  return {
    organizationId: key.organizationId,
    storeId: key.storeId,
    actor: { type: "system", id: key.apiKeyId },
    organizationRole: null,
    storeRole: null,
    organizationPermissions: createPermissionSet([]),
    storePermissions: createPermissionSet(key.scopes as StorePermission[]),
    requestId: "",
  };
}

// The Developer API (docs/architecture/09-api-conventions.md) — a deliberately small read-only
// slice (products, orders) for a first version, authenticated with the same Bearer credentials
// (static API keys or OAuth-issued tokens) rather than the admin's cookie session.
@Controller("api/2026-01")
@Public()
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(
    private readonly products: ProductsService,
    private readonly orders: OrdersService,
  ) {}

  @Get("products")
  @RequireScope("products.read")
  listProducts(
    @CurrentApiKey() key: ApiKeyPrincipal,
    @Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery,
  ) {
    return this.products.list(tenantFromApiKey(key), query);
  }

  @Get("products/:id")
  @RequireScope("products.read")
  getProduct(@CurrentApiKey() key: ApiKeyPrincipal, @Param("id") id: string) {
    return this.products.get(tenantFromApiKey(key), id);
  }

  @Get("orders")
  @RequireScope("orders.read")
  listOrders(
    @CurrentApiKey() key: ApiKeyPrincipal,
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
  ) {
    return this.orders.list(tenantFromApiKey(key), query);
  }

  @Get("orders/:id")
  @RequireScope("orders.read")
  getOrder(@CurrentApiKey() key: ApiKeyPrincipal, @Param("id") id: string) {
    return this.orders.get(tenantFromApiKey(key), id);
  }
}

@Controller("api/2026-01/oauth")
@Public()
export class OAuthController {
  constructor(private readonly apps: DeveloperAppsService) {}

  @Post("token")
  token(@Body(new ZodValidationPipe(oauthTokenInputSchema)) body: OAuthTokenInput) {
    return this.apps.issueToken(body);
  }
}
