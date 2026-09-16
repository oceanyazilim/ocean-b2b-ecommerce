import { Module } from "@nestjs/common";

import { CatalogsModule } from "../catalogs/catalogs.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PricingModule } from "../pricing/pricing.module";
import {
  SHIPPING_CALCULATOR,
  TAX_CALCULATOR,
  ZeroShippingCalculator,
  ZeroTaxCalculator,
} from "./calculators";
import { CartsController } from "./carts.controller";
import { CartsService } from "./carts.service";
import { DraftOrdersController } from "./draft-orders.controller";
import { DraftOrdersService } from "./draft-orders.service";
import { IdempotencyService } from "./idempotency.service";
import { LineQuoterService } from "./line-quoter.service";
import { OrderPlacementService } from "./order-placement.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [CatalogsModule, PricingModule, InventoryModule],
  controllers: [OrdersController, CartsController, DraftOrdersController],
  providers: [
    { provide: SHIPPING_CALCULATOR, useClass: ZeroShippingCalculator },
    { provide: TAX_CALCULATOR, useClass: ZeroTaxCalculator },
    IdempotencyService,
    LineQuoterService,
    OrderPlacementService,
    OrdersService,
    CartsService,
    DraftOrdersService,
  ],
  exports: [OrdersService, CartsService, LineQuoterService, OrderPlacementService],
})
export class OrdersModule {}
