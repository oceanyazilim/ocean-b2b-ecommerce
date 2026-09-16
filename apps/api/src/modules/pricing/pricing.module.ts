import { Module } from "@nestjs/common";

import { CatalogsModule } from "../catalogs/catalogs.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PriceListsController } from "./price-lists.controller";
import { PriceListsService } from "./price-lists.service";
import { PricingRulesService } from "./pricing-rules.service";
import { PricingController } from "./pricing.controller";
import { PricingService } from "./pricing.service";

@Module({
  imports: [CatalogsModule, InventoryModule],
  controllers: [PriceListsController, PricingController],
  providers: [PriceListsService, PricingRulesService, PricingService],
  exports: [PricingService],
})
export class PricingModule {}
