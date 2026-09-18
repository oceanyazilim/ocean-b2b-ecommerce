import { Module } from "@nestjs/common";

import { ShippingCalculatorService } from "./calculator";
import { ShippingController } from "./shipping.controller";
import { ShippingEligibilityService } from "./shipping-eligibility.service";
import { ShippingService } from "./shipping.service";

@Module({
  controllers: [ShippingController],
  providers: [ShippingService, ShippingEligibilityService, ShippingCalculatorService],
  exports: [ShippingEligibilityService, ShippingCalculatorService],
})
export class ShippingModule {}
