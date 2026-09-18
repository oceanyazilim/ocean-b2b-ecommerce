import { Module } from "@nestjs/common";

import { CatalogsModule } from "../catalogs/catalogs.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PaymentsModule } from "../payments/payments.module";
import { PricingModule } from "../pricing/pricing.module";
import { ShippingCalculatorService } from "../shipping/calculator";
import { ShippingModule } from "../shipping/shipping.module";
import { TaxCalculatorService } from "../tax/calculator";
import { TaxModule } from "../tax/tax.module";
import { SHIPPING_CALCULATOR, TAX_CALCULATOR } from "./calculators";
import { CartsController } from "./carts.controller";
import { CartsService } from "./carts.service";
import { DraftOrdersController } from "./draft-orders.controller";
import { DraftOrdersService } from "./draft-orders.service";
import { FulfillmentsController } from "./fulfillments.controller";
import { FulfillmentsService } from "./fulfillments.service";
import { IdempotencyService } from "./idempotency.service";
import { LineQuoterService } from "./line-quoter.service";
import { OrderPlacementService } from "./order-placement.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { ReturnsController } from "./returns.controller";
import { ReturnsService } from "./returns.service";

@Module({
  imports: [CatalogsModule, PricingModule, InventoryModule, ShippingModule, TaxModule, PaymentsModule],
  controllers: [
    OrdersController,
    CartsController,
    DraftOrdersController,
    FulfillmentsController,
    ReturnsController,
  ],
  providers: [
    { provide: SHIPPING_CALCULATOR, useExisting: ShippingCalculatorService },
    { provide: TAX_CALCULATOR, useExisting: TaxCalculatorService },
    IdempotencyService,
    LineQuoterService,
    OrderPlacementService,
    OrdersService,
    CartsService,
    DraftOrdersService,
    FulfillmentsService,
    ReturnsService,
  ],
  exports: [OrdersService, CartsService, LineQuoterService, OrderPlacementService],
})
export class OrdersModule {}
