import { Module } from "@nestjs/common";

import { CollectionsModule } from "../catalog/collections/collections.module";
import { ProductsModule } from "../catalog/products/products.module";
import { ContentModule } from "../content/content.module";
import { MarketsModule } from "../markets/markets.module";
import { ThemesModule } from "../themes/themes.module";
import { StorefrontController } from "./storefront.controller";

@Module({
  imports: [ProductsModule, CollectionsModule, ContentModule, MarketsModule, ThemesModule],
  controllers: [StorefrontController],
})
export class StorefrontApiModule {}
