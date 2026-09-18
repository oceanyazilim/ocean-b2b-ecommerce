import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  storefrontCollectionListQuerySchema,
  storefrontProductListQuerySchema,
  type StorefrontCollectionListQuery,
  type StorefrontProductListQuery,
} from "@ocean/types";

import { Public } from "../../common/auth/public.decorator";
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

  @Get("payment-methods")
  async listPaymentMethods(@CurrentTenant() tenant: TenantContext) {
    return (await this.paymentMethods.list(tenant)).filter((m) => m.isEnabled);
  }

  @Get("context")
  getContext(@CurrentTenant() tenant: TenantContext) {
    return { storeId: tenant.storeId, signedIn: tenant.actor.type === "customer" };
  }
}
