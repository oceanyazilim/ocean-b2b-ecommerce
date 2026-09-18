import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

import { StorefrontGuard } from "../../common/tenant/storefront.guard";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";

import { ProductsService } from "../catalog/products/products.service";
import { CollectionsService } from "../catalog/collections/collections.service";
import { ContentService } from "../content/content.service";
import { MarketsService } from "../markets/markets.service";
import { ThemesService } from "../themes/themes.service";

@Controller("storefront/v1")
@UseGuards(StorefrontGuard)
export class StorefrontController {
  constructor(
    private readonly products: ProductsService,
    private readonly collections: CollectionsService,
    private readonly content: ContentService,
    private readonly markets: MarketsService,
    private readonly themes: ThemesService,
  ) {}

  @Get("products")
  listProducts(@CurrentTenant() tenant: TenantContext, @Query() query: any) {
    return this.products.list(tenant, query);
  }
  
  @Get("products/:productId")
  getProduct(@CurrentTenant() tenant: TenantContext, @Param("productId") id: string) {
    return this.products.get(tenant, id);
  }

  @Get("collections")
  listCollections(@CurrentTenant() tenant: TenantContext, @Query() query: any) {
    return this.collections.list(tenant, query);
  }

  @Get("pages")
  listPages(@CurrentTenant() tenant: TenantContext) {
    return this.content.listPages(tenant);
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
  
  @Get("context")
  getContext(@CurrentTenant() tenant: TenantContext) {
    return {
      storeId: tenant.storeId,
      actor: tenant.actor,
    };
  }
}
