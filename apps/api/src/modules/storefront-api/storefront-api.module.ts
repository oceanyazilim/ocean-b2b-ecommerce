import { Module } from "@nestjs/common";

import { CatalogsModule } from "../catalogs/catalogs.module";
import { ContentModule } from "../content/content.module";
import { InventoryModule } from "../inventory/inventory.module";
import { MarketsModule } from "../markets/markets.module";
import { OrdersModule } from "../orders/orders.module";
import { PricingModule } from "../pricing/pricing.module";
import { ThemesModule } from "../themes/themes.module";
import { UsersModule } from "../users/users.module";
import { CustomerAuthController } from "./customer-auth.controller";
import { CustomerAuthService } from "./customer-auth.service";
import { StorefrontCartController } from "./storefront-cart.controller";
import { StorefrontCatalogService } from "./storefront-catalog.service";
import { StorefrontController } from "./storefront.controller";

@Module({
  imports: [
    CatalogsModule,
    PricingModule,
    InventoryModule,
    OrdersModule,
    ContentModule,
    MarketsModule,
    ThemesModule,
    UsersModule,
  ],
  controllers: [StorefrontController, CustomerAuthController, StorefrontCartController],
  providers: [StorefrontCatalogService, CustomerAuthService],
})
export class StorefrontApiModule {}
