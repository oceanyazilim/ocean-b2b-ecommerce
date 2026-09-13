import { Module } from "@nestjs/common";

import { CollectionsModule } from "../collections/collections.module";
import { MetafieldsModule } from "../metafields/metafields.module";
import { ProductsController } from "./products.controller";
import { ProductsRepository } from "./products.repository";
import { ProductsService } from "./products.service";

@Module({
  imports: [CollectionsModule, MetafieldsModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository],
  exports: [ProductsService],
})
export class ProductsModule {}
